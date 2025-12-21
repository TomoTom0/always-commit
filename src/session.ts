import * as state from './state';
import * as git from './git';

export async function getSession(options: { autoRepair: boolean } = { autoRepair: true }): Promise<state.State | null> {
    const currentState = await state.loadState();

    // Level 1: Validate and Repair existing state
    // We check from the *latest* commit backwards. If the latest commit doesn't exist (e.g. user did git reset --hard),
    // we should pop it and check the next one.
    let commits = [...currentState.commits];
    let changed = false;

    // Check availability of commits from newest to oldest
    // If we find a commit that doesn't exist, we must remove it and all following it?
    // Actually, in the `commits` array, index 0 is oldest, length-1 is newest.
    // If length-1 is missing, pop it.
    while (commits.length > 0) {
        const last = commits[commits.length - 1];
        if (!last) break;
        const isValid = await git.isAncestor(last.hash);
        if (!isValid) {
            commits.pop();
            changed = true;
        } else {
            // If the last one exists, we assume the chain is valid up to this point?
            // Safer to assume "Yes" for performance, but we rely on the fact that we push sequentially.
            // However, a user *could* rebase and remove an intermediate commit.
            // For now, checking the tip is the most critical recovery for "reset --hard".
            break;
        }
    }

    if (changed) {
        currentState.commits = commits;
        await state.saveState(currentState);
    }

    // If we still have commits, we have a valid session (at least partially)
    if (currentState.commits.length > 0) {
        return currentState;
    }

    // Level 2: Auto-repair from git history
    // If state is empty (or we popped everything), try to find a session from git log.
    if (options.autoRepair) {
        const alcomCommits = await git.findLatestAlcomSession();
        if (alcomCommits.length > 0) {
            // Repair state with found commits
            await state.repairSession(alcomCommits);
            return state.loadState();
        }
    }

    // No session found
    return null;
}
