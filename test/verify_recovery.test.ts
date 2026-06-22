import { test, expect } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { alcomOrThrow, gitInit, shOrThrow } from './helpers';

test('state file recovery from git history', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'alcom-recovery-test-'));

    try {
        gitInit(tmpDir);
        await writeFile(join(tmpDir, 'initial.txt'), '');
        shOrThrow('git', ['add', '.'], { cwd: tmpDir });
        shOrThrow('git', ['commit', '-m', 'Initial commit'], { cwd: tmpDir });

        await writeFile(join(tmpDir, 'file1.txt'), 'change 1\n');
        alcomOrThrow(['save', 'snap 1'], tmpDir);
        await writeFile(join(tmpDir, 'file2.txt'), 'change 2\n');
        alcomOrThrow(['save', 'snap 2'], tmpDir);

        const stateFile = join(tmpDir, '.git', 'always-commit.json');
        expect(existsSync(stateFile)).toBe(true);

        await rm(stateFile);
        expect(existsSync(stateFile)).toBe(false);

        alcomOrThrow(['finish', 'Recovered session'], tmpDir);

        const log = shOrThrow('git', ['log', '-1', '--pretty=%B'], { cwd: tmpDir }).stdout;
        expect(log).toContain('Recovered session');
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});
