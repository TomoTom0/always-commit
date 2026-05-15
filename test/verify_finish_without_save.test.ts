import { test, expect } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { alcomOrThrow, gitInit, shOrThrow } from './helpers';

test('finish works as normal commit without prior saves', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'alcom-test-'));

    try {
        gitInit(tmpDir);
        await writeFile(join(tmpDir, 'initial.txt'), '');
        shOrThrow('git', ['add', '.'], { cwd: tmpDir });
        shOrThrow('git', ['commit', '-m', 'Initial commit'], { cwd: tmpDir });

        await writeFile(join(tmpDir, 'file1.txt'), 'change 1\n');
        await writeFile(join(tmpDir, 'file2.txt'), 'change 2\n');

        alcomOrThrow(['finish', 'feat: add new files'], tmpDir);

        const log = shOrThrow('git', ['log', '-1', '--pretty=%B'], { cwd: tmpDir }).stdout;
        expect(log).toContain('feat: add new files');

        const file1 = shOrThrow('git', ['show', 'HEAD:file1.txt'], { cwd: tmpDir }).stdout;
        const file2 = shOrThrow('git', ['show', 'HEAD:file2.txt'], { cwd: tmpDir }).stdout;
        expect(file1).toContain('change 1');
        expect(file2).toContain('change 2');

        const status = shOrThrow('git', ['status', '--porcelain'], { cwd: tmpDir }).stdout;
        expect(status.trim()).toBe('');
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
}, 60000);
