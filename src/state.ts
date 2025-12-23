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
        return path.join(root, '.git', 'always-commit.json');
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
    const statePath = await getStatePath();
    await fs.writeJson(statePath, state, { spaces: 2 });
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
