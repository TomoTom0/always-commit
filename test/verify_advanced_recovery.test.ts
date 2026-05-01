import { test, expect } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { alcomOrThrow, gitInit, shOrThrow } from './helpers';

test('advanced recovery scenarios', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'alcom-adv-recovery-'));

    try {
        gitInit(tmpDir);
        await writeFile(join(tmpDir, 'initial.txt'), '');
        shOrThrow('git', ['add', '.'], { cwd: tmpDir });
        shOrThrow('git', ['commit', '-m', 'Initial commit'], { cwd: tmpDir });
        const initialHash = shOrThrow('git', ['rev-parse', 'HEAD'], { cwd: tmpDir }).stdout.trim();

        await writeFile(join(tmpDir, 'file1.txt'), 'change 1\n');
        alcomOrThrow(['save', 'snap 1'], tmpDir);
        await writeFile(join(tmpDir, 'file2.txt'), 'change 2\n');
        alcomOrThrow(['save', 'snap 2'], tmpDir);

        const stateFile = join(tmpDir, '.git', 'always-commit.json');
        let state = JSON.parse(await readFile(stateFile, 'utf-8'));
        expect(state.commits.length).toBe(2);

        shOrThrow('git', ['reset', '--hard', 'HEAD~1'], { cwd: tmpDir });

        alcomOrThrow(['base-hash'], tmpDir);

        state = JSON.parse(await readFile(stateFile, 'utf-8'));
        expect(state.commits.length).toBe(1);

        await writeFile(join(tmpDir, 'file2.txt'), 'change 2 again\n');
        alcomOrThrow(['save', 'snap 3'], tmpDir);

        await rm(stateFile);

        alcomOrThrow(['base-hash'], tmpDir);

        expect(existsSync(stateFile)).toBe(true);
        state = JSON.parse(await readFile(stateFile, 'utf-8'));
        expect(state.commits.length).toBe(2);
        expect(state.commits[0].message).toContain('snap 1');
        expect(state.commits[1].message).toContain('snap 3');

        await rm(stateFile);

        alcomOrThrow(['finish', 'Complete feature', '--base', initialHash], tmpDir);

        const parent = shOrThrow('git', ['rev-parse', 'HEAD^'], { cwd: tmpDir }).stdout.trim();
        expect(parent).toBe(initialHash);

        const msg = shOrThrow('git', ['log', '-1', '--pretty=%B'], { cwd: tmpDir }).stdout;
        expect(msg).toContain('Complete feature');
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
}, 60000);
