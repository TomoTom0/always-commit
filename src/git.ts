import simpleGit, { type SimpleGit } from 'simple-git';

const git: SimpleGit = simpleGit();

export async function commitAll(message: string, allowEmpty: boolean = false): Promise<string> {
    await git.add('.');
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

export interface CommitInfo {
    hash: string;
    parentHash: string;
    message: string;
    treeHash: string;
    date: string;
}

export async function getCommits(baseHash: string, headHash: string = 'HEAD'): Promise<CommitInfo[]> {
    const log = await git.log({ from: baseHash, to: headHash });
    // simple-git log returns most recent first. We usually want oldest first for processing.
    // However, let's just return what it gives and handle order in caller or reverse here.
    // Let's reverse it to be chronological (oldest first).

    // We need tree hash too. simple-git log might not give it by default.
    // Let's use raw log for precision.
    const rawLog = await git.raw([
        'log',
        '--pretty=format:%H|%P|%T|%cd|%s',
        '--date=format:%Y-%m-%d %H:%M:%S',
        `${baseHash}..${headHash}`,
        '--reverse' // Oldest first
    ]);

    return parseGitLog(rawLog);
}

export async function commitTree(treeHash: string, parentHash: string, message: string): Promise<string> {
    const result = await git.raw(['commit-tree', treeHash, '-p', parentHash, '-m', message]);
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

export async function findLatestAlcomSession(limit: number = 50): Promise<CommitInfo[]> {
    // Get recent commits
    const commits = await getLog(limit);

    // Filter and group contiguous alcom commits from the most recent one backwards.
    // However, if we are in a state where we made some manual commits AFTER the session,
    // we might want to recover the *last active session*.
    //
    // Strategy:
    // 1. Iterate from newest to oldest.
    // 2. Find the first occurrence of an alcom commit (start of a session looking backwards).
    // 3. Continue collecting alcom commits until we hit a non-alcom commit or end of list.
    //
    // Note: This assumes a session is a contiguous block. If a user did manual commits
    // interspersed with saves, this logic might break (or treat them as separate sessions).
    // Current alcom design encourages "save -> save -> finish", so contiguous is a fair assumption.

    let sessionCommits: CommitInfo[] = [];
    let foundSession = false;

    for (const commit of commits) {
        if (commit.message.startsWith('--alcom--')) {
            foundSession = true;
            sessionCommits.push(commit);
        } else {
            if (foundSession) {
                // We found a session and now hit a non-alcom commit.
                // This marks the boundary (the "base" is this commit).
                break;
            }
            // If we haven't found a session yet, keep looking.
        }
    }

    // Return chronological order (oldest first) as expected by state
    return sessionCommits.reverse();
}

export async function isAncestor(ancestor: string, descendant: string = 'HEAD'): Promise<boolean> {
    const proc = Bun.spawn(['git', 'merge-base', '--is-ancestor', ancestor, descendant], {
        stdout: 'ignore',
        stderr: 'ignore'
    });
    const exitCode = await proc.exited;
    return exitCode === 0;
}
