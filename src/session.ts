import * as state from './state';
import * as git from './git';

export async function getSession(options: { autoRepair: boolean } = { autoRepair: true }): Promise<state.State | null> {
    const currentState = await state.loadState();

    // Level 1: Validate and Repair existing state
    // Filter out commits that don't exist or aren't ancestors of HEAD
    let commits = [...currentState.commits];
    let validCommits: state.Commit[] = [];

    for (const commit of commits) {
        const isValid = await git.isAncestor(commit.hash);
        if (isValid) {
            validCommits.push(commit);
        }
    }

    if (validCommits.length !== commits.length) {
        currentState.commits = validCommits;
        await state.saveState(currentState);
    }

    // If we still have commits, we have a valid session
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
