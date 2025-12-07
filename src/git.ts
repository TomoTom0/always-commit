import simpleGit, { SimpleGit } from 'simple-git';

const git: SimpleGit = simpleGit();

export async function commitAll(message: string): Promise<string> {
    await git.add('.');
    const result = await git.commit(message);
    return result.commit;
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
