import fs from 'fs-extra';
import path from 'path';

export let STATE_FILE = path.join('.git', 'always-commit.json');

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
    if (await fs.pathExists(STATE_FILE)) {
        return fs.readJson(STATE_FILE);
    }
    return { commits: [] };
}

export async function saveState(state: State): Promise<void> {
    await fs.writeJson(STATE_FILE, state, { spaces: 2 });
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
    await fs.remove(STATE_FILE);
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
