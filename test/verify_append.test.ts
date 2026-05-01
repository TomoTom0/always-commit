import { test, expect } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { alcomOrThrow, gitInit, shOrThrow } from './helpers';

test('finish --append includes alcom save messages', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'alcom-test-'));

    try {
        gitInit(tmpDir);
        await writeFile(join(tmpDir, 'initial.txt'), '');
        shOrThrow('git', ['add', '.'], { cwd: tmpDir });
        shOrThrow('git', ['commit', '-m', 'Initial commit'], { cwd: tmpDir });

        await writeFile(join(tmpDir, 'file1.txt'), 'change 1\n');
        alcomOrThrow(['save', 'First change'], tmpDir);

        await writeFile(join(tmpDir, 'file2.txt'), 'change 2\n');
        alcomOrThrow(['save', 'Second change'], tmpDir);

        alcomOrThrow(['finish', 'Feature complete', '--append'], tmpDir);

        const log = shOrThrow('git', ['log', '-1', '--pretty=%B'], { cwd: tmpDir }).stdout;
        expect(log).toContain('Feature complete');
        expect(log).toContain('- First change');
        expect(log).toContain('- Second change');
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
}, 60000);
