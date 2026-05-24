import fs from 'fs-extra';
import path from 'path';
import * as git from './git';

const DEFAULT_STATE_FILE = path.join('.git', 'always-commit.json');
export let STATE_FILE = DEFAULT_STATE_FILE;

// State file path priorities (relative to git root)
const STATE_FILE_PRIORITIES = [
    path.join('.git', 'always-commit.json'),  // Priority 1
    'always-commit.json',                      // Priority 2
    '.always-commit.json'                      // Priority 3
];

export async function getStatePath(): Promise<string> {
    // If a custom state file has been set (e.g., for testing), use it as-is
    if (STATE_FILE !== DEFAULT_STATE_FILE) {
        return STATE_FILE;
    }

    // For the default state file, resolve it relative to git root
    if (path.isAbsolute(STATE_FILE)) return STATE_FILE;
    try {
        const root = await git.getGitRoot();

        // Check paths in priority order
        for (const relativePath of STATE_FILE_PRIORITIES) {
            const fullPath = path.join(root, relativePath);
            if (await fs.pathExists(fullPath)) {
                return fullPath;
            }
        }

        // Return default path (lowest priority)
        return path.join(root, STATE_FILE_PRIORITIES[STATE_FILE_PRIORITIES.length - 1]);
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
    undoStack: Commit[];
}

const defaultState: State = {
    commits: [],
    undoStack: [],
};

export async function loadState(): Promise<State> {
    const statePath = await getStatePath();
    if (await fs.pathExists(statePath)) {
        const raw = await fs.readJson(statePath);
        return { commits: raw.commits ?? [], undoStack: raw.undoStack ?? [] };
    }
    return { commits: [], undoStack: [] };
}

export async function saveState(state: State): Promise<void> {
    // If a custom state file has been set, use it directly
    if (STATE_FILE !== DEFAULT_STATE_FILE) {
        await fs.writeJson(STATE_FILE, state, { spaces: 2 });
        return;
    }

    const root = await git.getGitRoot();

    // Try paths in priority order
    for (const relativePath of STATE_FILE_PRIORITIES) {
        const statePath = path.join(root, relativePath);
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
    state.undoStack = [];
    await saveState(state);
}

export async function popCommit(): Promise<Commit | undefined> {
    const state = await loadState();
    const commit = state.commits.pop();
    if (commit) {
        state.undoStack.push(commit);
        await saveState(state);
    }
    return commit;
}

export async function pushCommit(commit: Commit): Promise<void> {
    const state = await loadState();
    state.commits.push(commit);
    await saveState(state);
}

export async function popUndoStack(): Promise<Commit | undefined> {
    const state = await loadState();
    const commit = state.undoStack.pop();
    if (commit) {
        await saveState(state);
    }
    return commit;
}

export async function clearUndoStack(): Promise<void> {
    const state = await loadState();
    state.undoStack = [];
    await saveState(state);
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
