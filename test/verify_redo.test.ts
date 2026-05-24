import { test, expect } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { alcom, alcomOrThrow, gitInit, shOrThrow } from './helpers';

test('redo restores the last undone snapshot', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'alcom-redo-'));

    try {
        gitInit(tmpDir);

        await writeFile(join(tmpDir, 'base.txt'), 'base\n');
        shOrThrow('git', ['add', 'base.txt'], { cwd: tmpDir });
        shOrThrow('git', ['commit', '-m', 'chore: base commit'], { cwd: tmpDir });

        await writeFile(join(tmpDir, 'work.txt'), 'work\n');
        alcomOrThrow(['save', 'WIP: snapshot 1'], tmpDir);

        // Undo
        const undoResult = JSON.parse(alcomOrThrow(['undo'], tmpDir).stdout);
        expect(undoResult.status).toBe('ok');

        // File should be gone after undo
        const filesAfterUndo = shOrThrow('git', ['ls-tree', '-r', 'HEAD', '--name-only'], { cwd: tmpDir }).stdout;
        expect(filesAfterUndo).not.toContain('work.txt');

        // Redo
        const redoResult = JSON.parse(alcomOrThrow(['redo'], tmpDir).stdout);
        expect(redoResult.status).toBe('ok');
        expect(redoResult.action).toBe('redo');
        expect(redoResult.restoredMessage).toBe('WIP: snapshot 1');

        // File should be back after redo
        const filesAfterRedo = shOrThrow('git', ['ls-tree', '-r', 'HEAD', '--name-only'], { cwd: tmpDir }).stdout;
        expect(filesAfterRedo).toContain('work.txt');
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});

test('consecutive redo restores multiple undone snapshots', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'alcom-redo-multi-'));

    try {
        gitInit(tmpDir);

        await writeFile(join(tmpDir, 'base.txt'), 'base\n');
        shOrThrow('git', ['add', 'base.txt'], { cwd: tmpDir });
        shOrThrow('git', ['commit', '-m', 'chore: base commit'], { cwd: tmpDir });

        await writeFile(join(tmpDir, 'a.txt'), 'a\n');
        alcomOrThrow(['save', 'snapshot a'], tmpDir);

        await writeFile(join(tmpDir, 'b.txt'), 'b\n');
        alcomOrThrow(['save', 'snapshot b'], tmpDir);

        // Undo both
        alcomOrThrow(['undo'], tmpDir);
        alcomOrThrow(['undo'], tmpDir);

        // Redo first (LIFO: snapshot a was undone last, so it's restored first)
        const redo1 = JSON.parse(alcomOrThrow(['redo'], tmpDir).stdout);
        expect(redo1.restoredMessage).toBe('snapshot a');

        // Redo second
        const redo2 = JSON.parse(alcomOrThrow(['redo'], tmpDir).stdout);
        expect(redo2.restoredMessage).toBe('snapshot b');

        // Both files should be present
        const files = shOrThrow('git', ['ls-tree', '-r', 'HEAD', '--name-only'], { cwd: tmpDir }).stdout;
        expect(files).toContain('a.txt');
        expect(files).toContain('b.txt');
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});

test('redo without undo returns error', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'alcom-redo-none-'));

    try {
        gitInit(tmpDir);

        await writeFile(join(tmpDir, 'base.txt'), 'base\n');
        shOrThrow('git', ['add', 'base.txt'], { cwd: tmpDir });
        shOrThrow('git', ['commit', '-m', 'chore: base commit'], { cwd: tmpDir });

        const result = alcom(['redo'], tmpDir);
        expect(result.code).not.toBe(0);
        const err = JSON.parse(result.stderr);
        expect(err.status).toBe('error');
        expect(err.message).toContain('Nothing to redo');
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});

test('save after undo clears redo stack', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'alcom-redo-clear-'));

    try {
        gitInit(tmpDir);

        await writeFile(join(tmpDir, 'base.txt'), 'base\n');
        shOrThrow('git', ['add', 'base.txt'], { cwd: tmpDir });
        shOrThrow('git', ['commit', '-m', 'chore: base commit'], { cwd: tmpDir });

        await writeFile(join(tmpDir, 'a.txt'), 'a\n');
        alcomOrThrow(['save', 'snapshot a'], tmpDir);

        // Undo
        alcomOrThrow(['undo'], tmpDir);

        // New save (should clear redo stack)
        await writeFile(join(tmpDir, 'b.txt'), 'b\n');
        alcomOrThrow(['save', 'snapshot b'], tmpDir);

        // Redo should fail now
        const result = alcom(['redo'], tmpDir);
        expect(result.code).not.toBe(0);
        const err = JSON.parse(result.stderr);
        expect(err.message).toContain('Nothing to redo');
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});
