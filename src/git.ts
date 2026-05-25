import simpleGit, { type SimpleGit } from 'simple-git';
import { spawn } from 'child_process';

const git: SimpleGit = simpleGit();

export const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

export async function commitAll(message: string, allowEmpty: boolean = false): Promise<string> {
    await git.add(['-A']);
    const options = allowEmpty ? { '--allow-empty': null } : {};
    const result = await git.commit(message, undefined, options as any);
    return result.commit;
}

export async function hasChanges(): Promise<boolean> {
    const status = await git.status();
    return status.files.length > 0;
}

export async function resetHard(hash: string): Promise<void> {
    await git.reset(['--hard', hash]);
}

export async function resetMixed(hash: string): Promise<void> {
    await git.reset(['--mixed', hash]);
}

export async function getCurrentHead(): Promise<string> {
    const result = await git.revparse(['HEAD']);
    return result.trim();
}

export async function getParentHash(hash: string): Promise<string> {
    const result = await git.revparse([`${hash}^`]);
    return result.trim();
}

export async function isRootCommit(hash: string): Promise<boolean> {
    try {
        await git.revparse([`${hash}^`]);
        return false; // Has a parent, not a root commit
    } catch {
        return true; // No parent, is a root commit
    }
}

export interface CommitInfo {
    hash: string;
    parentHash: string;
    message: string;
    treeHash: string;
    date: string;
}

export async function getCommits(baseHash: string, headHash: string = 'HEAD'): Promise<CommitInfo[]> {
    // We need tree hash too. simple-git log might not give it by default.
    // Let's use raw log for precision.

    // If baseHash is the empty tree (used for root commits), get all commits from HEAD
    const range = baseHash === EMPTY_TREE ? headHash : `${baseHash}..${headHash}`;

    const rawLog = await git.raw([
        'log',
        '--pretty=format:%H|%P|%T|%cd|%s',
        '--date=format:%Y-%m-%d %H:%M:%S',
        range,
        '--reverse' // Oldest first
    ]);

    return parseGitLog(rawLog);
}

export async function commitTree(treeHash: string, parentHash: string, message: string): Promise<string> {
    const result = await git.raw(['commit-tree', treeHash, '-p', parentHash, '-m', message]);
    return result.trim();
}

export async function commitTreeOrphan(treeHash: string, message: string): Promise<string> {
    const result = await git.raw(['commit-tree', treeHash, '-m', message]);
    return result.trim();
}

export async function getTreeHash(ref: string = 'HEAD'): Promise<string> {
    const result = await git.raw(['rev-parse', `${ref}^{tree}`]);
    return result.trim();
}

export async function updateRef(ref: string, commitHash: string): Promise<void> {
    await git.raw(['update-ref', ref, commitHash]);
}

export async function getCurrentBranch(): Promise<string> {
    const result = await git.revparse(['--abbrev-ref', 'HEAD']);
    return result.trim();
}
export async function getLog(maxCount: number = 100): Promise<CommitInfo[]> {
    const rawLog = await git.raw([
        'log',
        '--pretty=format:%H|%P|%T|%cd|%s',
        '--date=format:%Y-%m-%d %H:%M:%S',
        `-n ${maxCount}`
    ]);

    return parseGitLog(rawLog);
}

function parseGitLog(rawLog: string): CommitInfo[] {
    if (!rawLog.trim()) return [];

    return rawLog.split('\n').map(line => {
        const [hash, parentHash, treeHash, date, ...messageParts] = line.split('|');
        return {
            hash: hash || '',
            parentHash: (parentHash || '').split(' ')[0] || '',
            treeHash: treeHash || '',
            date: date || '',
            message: messageParts.join('|')
        };
    });
}

export async function getGitRoot(): Promise<string> {
    const result = await git.revparse(['--show-toplevel']);
    return result.trim();
}

export async function checkCommitExists(hash: string): Promise<boolean> {
    try {
        await git.catFile(['-e', hash]);
        return true;
    } catch {
        return false;
    }
}

export function isAlcomCommit(message: string): boolean {
    return message.includes('--alcom--');
}

export async function findBaseCommit(): Promise<string> {
    try {
        const startHash = await getCurrentHead();
        const baseHash = await git.raw([
            'log',
            '--first-parent',
            '--fixed-strings',
            '--grep=--alcom--',
            '--invert-grep',
            '-n', '1',
            '--format=%H',
            startHash,
        ]);
        return baseHash.trim() || EMPTY_TREE;
    } catch {
        return EMPTY_TREE;
    }
}

export async function findLatestAlcomSession(): Promise<CommitInfo[]> {
    try {
        const base = await findBaseCommit();
        const headHash = await getCurrentHead();
        if (base === headHash) return [];
        return await getCommits(base, headHash);
    } catch {
        return [];
    }
}

export interface DiffEntry {
    path: string;
    added: number;
    deleted: number;
}

export async function getDiffStat(): Promise<DiffEntry[]> {
    const status = await git.status();
    if (status.files.length === 0) return [];

    // git diff --numstat HEAD captures all changes (working tree + index vs HEAD),
    // but only for tracked files. We need to also handle untracked files.
    const [trackedDiff, cachedDiff] = await Promise.all([
        git.raw(['diff', '--numstat', 'HEAD']),
        git.raw(['diff', '--cached', '--numstat', 'HEAD']),
    ]);

    const entries = new Map<string, DiffEntry>();

    for (const raw of [trackedDiff, cachedDiff]) {
        for (const line of raw.trim().split('\n').filter(Boolean)) {
            const [addStr, delStr, filePath] = line.split('\t');
            const added = addStr === '-' ? 0 : parseInt(addStr, 10);
            const deleted = delStr === '-' ? 0 : parseInt(delStr, 10);
            const existing = entries.get(filePath);
            if (existing) {
                existing.added += added;
                existing.deleted += deleted;
            } else {
                entries.set(filePath, { path: filePath, added, deleted });
            }
        }
    }

    // Untracked files won't appear in diff; add them from status with 0 counts.
    // After git add they'll show in cached diff, but some may only be in working tree.
    for (const f of status.not_added) {
        if (!entries.has(f)) {
            entries.set(f, { path: f, added: 0, deleted: 0 });
        }
    }
    for (const f of status.created) {
        if (!entries.has(f)) {
            entries.set(f, { path: f, added: 0, deleted: 0 });
        }
    }

    return Array.from(entries.values());
}

export async function getDiffNameStatus(from: string, to: string): Promise<string[]> {
    const result = await git.raw(['diff', '--name-status', from, to]);
    return result.trim().split('\n').filter(Boolean);
}

export async function isAncestor(ancestor: string, descendant: string = 'HEAD'): Promise<boolean> {
    return new Promise((resolve, reject) => {
        const proc = spawn('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
            stdio: 'ignore'
        });
        proc.on('error', reject);
        proc.on('close', (exitCode) => {
            resolve(exitCode === 0);
        });
    });
}
