import fs from 'fs-extra';
import path from 'path';
import * as git from './git';

const DEFAULT_STATE_FILE = path.join('.git', 'always-commit.json');
export let STATE_FILE = DEFAULT_STATE_FILE;

export async function getStatePath(): Promise<string> {
    // If a custom state file has been set (e.g., for testing), use it as-is
    if (STATE_FILE !== DEFAULT_STATE_FILE) {
        return STATE_FILE;
    }

    // For the default state file, resolve it relative to git root
    if (path.isAbsolute(STATE_FILE)) return STATE_FILE;
    try {
        const root = await git.getGitRoot();

        // Priority 1: .git/always-commit.json
        const gitInternal = path.join(root, '.git', 'always-commit.json');
        if (await fs.pathExists(gitInternal)) {
            return gitInternal;
        }

        // Priority 2: Same level as .git - always-commit.json
        const rootLevel = path.join(root, 'always-commit.json');
        if (await fs.pathExists(rootLevel)) {
            return rootLevel;
        }

        // Priority 3: Same level as .git - .always-commit.json (hidden file)
        return path.join(root, '.always-commit.json');
    } catch {
        // Fallback for when git root can't be found (e.g. not in a repo)
        return STATE_FILE;
    }
}

export function setStateFile(path: string) {
    STATE_FILE = path;
}

export interface Commit {
    hash: string;
    message: string;
    timestamp: number;
}

export interface State {
    commits: Commit[];
}

const defaultState: State = {
    commits: [],
};

export async function loadState(): Promise<State> {
    const statePath = await getStatePath();
    if (await fs.pathExists(statePath)) {
        return fs.readJson(statePath);
    }
    return { commits: [] };
}

export async function saveState(state: State): Promise<void> {
    // If a custom state file has been set, use it directly
    if (STATE_FILE !== DEFAULT_STATE_FILE) {
        await fs.writeJson(STATE_FILE, state, { spaces: 2 });
        return;
    }

    const root = await git.getGitRoot();

    // Try paths in priority order
    const paths = [
        path.join(root, '.git', 'always-commit.json'),
        path.join(root, 'always-commit.json'),
        path.join(root, '.always-commit.json')
    ];

    for (const statePath of paths) {
        try {
            await fs.writeJson(statePath, state, { spaces: 2 });
            return;
        } catch {
            // Try next path
        }
    }

    throw new Error('Failed to save state file');
}

export async function addCommit(hash: string, message: string): Promise<void> {
    const state = await loadState();
    state.commits.push({
        hash,
        message,
        timestamp: Date.now(),
    });
    await saveState(state);
}

export async function popCommit(): Promise<Commit | undefined> {
    const state = await loadState();
    const commit = state.commits.pop();
    if (commit) {
        await saveState(state);
    }
    return commit;
}

export async function clearState(): Promise<void> {
    const statePath = await getStatePath();
    await fs.remove(statePath);
}

export async function getLastCommit(): Promise<Commit | undefined> {
    const state = await loadState();
    return state.commits[state.commits.length - 1];
}

export async function getFirstCommit(): Promise<Commit | undefined> {
    const state = await loadState();
    return state.commits[0];
}

export async function repairSession(commits: { hash: string; message: string; date: string }[]): Promise<void> {
    const state: State = {
        commits: commits.map(c => ({
            hash: c.hash,
            message: c.message,
            timestamp: new Date(c.date).getTime()
        }))
    };
    await saveState(state);
}
