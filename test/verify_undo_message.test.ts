import { test, expect } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { alcom, alcomOrThrow, gitInit, shOrThrow } from './helpers';

test('undo output includes undoneMessage, revertedFiles, and hint', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'alcom-undo-msg-'));

    try {
        gitInit(tmpDir);

        await writeFile(join(tmpDir, 'base.txt'), 'base\n');
        shOrThrow('git', ['add', 'base.txt'], { cwd: tmpDir });
        shOrThrow('git', ['commit', '-m', 'chore: base commit'], { cwd: tmpDir });

        await writeFile(join(tmpDir, 'work.txt'), 'work\n');
        await writeFile(join(tmpDir, 'new.txt'), 'new\n');
        alcomOrThrow(['save', 'WIP: refactoring'], tmpDir);

        const undoOut = alcomOrThrow(['undo'], tmpDir).stdout;
        const result = JSON.parse(undoOut);

        expect(result.status).toBe('ok');
        expect(result.action).toBe('undo');
        expect(result.undoneMessage).toBe('WIP: refactoring');
        expect(result.revertedFiles).toEqual(
            expect.arrayContaining([
                expect.stringContaining('work.txt'),
                expect.stringContaining('new.txt'),
            ])
        );
        expect(result.hint).toContain('alcom redo');
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});

test('undo error when no snapshots', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'alcom-undo-none-'));

    try {
        gitInit(tmpDir);

        await writeFile(join(tmpDir, 'base.txt'), 'base\n');
        shOrThrow('git', ['add', 'base.txt'], { cwd: tmpDir });
        shOrThrow('git', ['commit', '-m', 'chore: base commit'], { cwd: tmpDir });

        const result = alcom(['undo'], tmpDir);
        expect(result.code).not.toBe(0);
        const err = JSON.parse(result.stderr);
        expect(err.status).toBe('error');
        expect(err.message).toContain('No snapshots to undo');
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});
