import * as state from './state';
import * as git from './git';

export async function getSession(): Promise<state.State | null> {
    // Always rebuild session from HEAD to ensure consistency
    // Strategy:
    // 1. Check if HEAD is an --alcom-- commit
    // 2. If yes, collect consecutive --alcom-- commits from HEAD backwards
    // 3. Update state file with the correct session
    // 4. If no, clear state and return null

    const alcomCommits = await git.findLatestAlcomSession();

    if (alcomCommits.length === 0) {
        // HEAD is not an --alcom-- commit, no active session
        await state.clearState();
        return null;
    }

    // Rebuild state from git history
    await state.repairSession(alcomCommits);
    return state.loadState();
}
