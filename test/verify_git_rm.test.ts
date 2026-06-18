import { test, expect } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { alcomOrThrow, gitInit, shOrThrow, sh } from './helpers';

test('finish preserves file deletion via git rm with intermediate save', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'alcom-test-rm-'));

    try {
        gitInit(tmpDir);

        await writeFile(join(tmpDir, 'keep.txt'), 'keep this file\n');
        await writeFile(join(tmpDir, 'delete.txt'), 'delete this file\n');
        shOrThrow('git', ['add', '.'], { cwd: tmpDir });
        shOrThrow('git', ['commit', '-m', 'Initial commit'], { cwd: tmpDir });

        await writeFile(join(tmpDir, 'new.txt'), 'new file\n');
        alcomOrThrow(['save', 'added new file'], tmpDir);

        shOrThrow('git', ['rm', 'delete.txt'], { cwd: tmpDir });
        alcomOrThrow(['save', 'deleted file'], tmpDir);

        alcomOrThrow(['finish', 'feat: final commit with deletion'], tmpDir);

        const showResult = sh('git', ['show', 'HEAD:delete.txt'], { cwd: tmpDir });
        expect(showResult.code).not.toBe(0);

        const keepContent = shOrThrow('git', ['show', 'HEAD:keep.txt'], { cwd: tmpDir }).stdout;
        expect(keepContent).toContain('keep this file');

        const newContent = shOrThrow('git', ['show', 'HEAD:new.txt'], { cwd: tmpDir }).stdout;
        expect(newContent).toContain('new file');
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
}, 60000);

test('finish preserves file deletion via git rm without intermediate save', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'alcom-test-rm2-'));

    try {
        gitInit(tmpDir);

        await writeFile(join(tmpDir, 'keep.txt'), 'keep this file\n');
        await writeFile(join(tmpDir, 'delete.txt'), 'delete this file\n');
        shOrThrow('git', ['add', '.'], { cwd: tmpDir });
        shOrThrow('git', ['commit', '-m', 'Initial commit'], { cwd: tmpDir });

        await writeFile(join(tmpDir, 'new.txt'), 'new file\n');
        alcomOrThrow(['save', 'added new file'], tmpDir);

        shOrThrow('git', ['rm', 'delete.txt'], { cwd: tmpDir });

        alcomOrThrow(['finish', 'feat: final with deletion'], tmpDir);

        const showResult = sh('git', ['show', 'HEAD:delete.txt'], { cwd: tmpDir });
        expect(showResult.code).not.toBe(0);

        const keepContent = shOrThrow('git', ['show', 'HEAD:keep.txt'], { cwd: tmpDir }).stdout;
        expect(keepContent).toContain('keep this file');

        const newContent = shOrThrow('git', ['show', 'HEAD:new.txt'], { cwd: tmpDir }).stdout;
        expect(newContent).toContain('new file');
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
}, 60000);
