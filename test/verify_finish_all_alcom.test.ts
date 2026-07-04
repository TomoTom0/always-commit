import { test, expect } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { alcomOrThrow, gitInit, shOrThrow } from './helpers';

test('finish creates orphan root commit when all commits are alcom', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'alcom-test-'));

    try {
        gitInit(tmpDir);

        await writeFile(join(tmpDir, 'file1.txt'), 'file1\n');
        alcomOrThrow(['save', 'first save'], tmpDir);

        await writeFile(join(tmpDir, 'file2.txt'), 'file2\n');
        alcomOrThrow(['save', 'second save'], tmpDir);

        await writeFile(join(tmpDir, 'file3.txt'), 'file3\n');
        alcomOrThrow(['save', 'third save'], tmpDir);

        const logBefore = shOrThrow('git', ['log', '--oneline'], { cwd: tmpDir }).stdout;
        const alcomCount = (logBefore.match(/--alcom--/g) || []).length;
        expect(alcomCount).toBeGreaterThanOrEqual(3);

        const commitCount = logBefore.trim().split('\n').length;
        expect(alcomCount).toBe(commitCount);

        const finishOut = alcomOrThrow(['finish', 'feat: complete feature'], tmpDir).stdout;
        const result = JSON.parse(finishOut);
        expect(result.status).toBe('ok');

        const logAfter = shOrThrow('git', ['log', '--oneline'], { cwd: tmpDir }).stdout;
        expect(logAfter.trim().split('\n').length).toBe(1);

        const lastMsg = shOrThrow('git', ['log', '-1', '--pretty=%B'], { cwd: tmpDir }).stdout;
        expect(lastMsg).toContain('feat: complete feature');

        const files = shOrThrow('git', ['ls-tree', '-r', 'HEAD', '--name-only'], { cwd: tmpDir }).stdout;
        expect(files).toContain('file1.txt');
        expect(files).toContain('file2.txt');
        expect(files).toContain('file3.txt');

        const parent = shOrThrow('git', ['rev-list', '--parents', '-n', '1', 'HEAD'], { cwd: tmpDir }).stdout.trim();
        expect(parent.split(' ').length).toBe(1);
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});
