import { test, expect } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { alcom, alcomOrThrow, gitInit, shOrThrow } from './helpers';

test('save --auto generates message with diff amounts', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'alcom-auto-'));

    try {
        gitInit(tmpDir);

        await writeFile(join(tmpDir, 'base.txt'), 'base\n');
        shOrThrow('git', ['add', 'base.txt'], { cwd: tmpDir });
        shOrThrow('git', ['commit', '-m', 'chore: base commit'], { cwd: tmpDir });

        await writeFile(join(tmpDir, 'foo.ts'), 'export const foo = 1;\n');
        await writeFile(join(tmpDir, 'bar.ts'), 'export const bar = 2;\n');

        const result = alcomOrThrow(['save', '--auto'], tmpDir);
        const parsed = JSON.parse(result.stdout);

        expect(parsed.status).toBe('ok');
        expect(parsed.action).toBe('save');

        const logResult = shOrThrow('git', ['log', '-1', '--format=%s'], { cwd: tmpDir });
        const msg = logResult.stdout.trim();
        expect(msg).toContain('--alcom--');
        // Should contain file with change amounts format
        expect(msg).toMatch(/foo\.ts \(\+\d+\/-\d+\)/);
        expect(msg).toMatch(/bar\.ts \(\+\d+\/-\d+\)/);
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});

test('save --auto sorts files by change amount descending', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'alcom-auto-sort-'));

    try {
        gitInit(tmpDir);

        await writeFile(join(tmpDir, 'base.txt'), 'base\n');
        shOrThrow('git', ['add', 'base.txt'], { cwd: tmpDir });
        shOrThrow('git', ['commit', '-m', 'chore: base commit'], { cwd: tmpDir });

        // small.ts has 1 line, large.ts has 20 lines
        const largeContent = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n');
        await writeFile(join(tmpDir, 'small.ts'), 'one line\n');
        await writeFile(join(tmpDir, 'large.ts'), largeContent + '\n');

        const result = alcomOrThrow(['save', '--auto'], tmpDir);
        const parsed = JSON.parse(result.stdout);
        expect(parsed.status).toBe('ok');

        const logResult = shOrThrow('git', ['log', '-1', '--format=%s'], { cwd: tmpDir });
        const msg = logResult.stdout.trim();
        // large.ts should appear before small.ts (more changes)
        const largeIdx = msg.indexOf('large.ts');
        const smallIdx = msg.indexOf('small.ts');
        expect(largeIdx).toBeGreaterThan(-1);
        expect(smallIdx).toBeGreaterThan(-1);
        expect(largeIdx).toBeLessThan(smallIdx);
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});

test('save --auto falls back to timestamp when no changes', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'alcom-auto-empty-'));

    try {
        gitInit(tmpDir);

        await writeFile(join(tmpDir, 'base.txt'), 'base\n');
        shOrThrow('git', ['add', 'base.txt'], { cwd: tmpDir });
        shOrThrow('git', ['commit', '-m', 'chore: base commit'], { cwd: tmpDir });

        // No changes - should skip
        const result = alcom(['save', '--auto'], tmpDir);
        const parsed = JSON.parse(result.stdout);
        expect(parsed.status).toBe('skipped');
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});

test('save --auto --force generates timestamp message with no changes', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'alcom-auto-force-'));

    try {
        gitInit(tmpDir);

        await writeFile(join(tmpDir, 'base.txt'), 'base\n');
        shOrThrow('git', ['add', 'base.txt'], { cwd: tmpDir });
        shOrThrow('git', ['commit', '-m', 'chore: base commit'], { cwd: tmpDir });

        // Force with no changes - should use timestamp as message
        const result = alcomOrThrow(['save', '--auto', '--force'], tmpDir);
        const parsed = JSON.parse(result.stdout);
        expect(parsed.status).toBe('ok');

        const logResult = shOrThrow('git', ['log', '-1', '--format=%s'], { cwd: tmpDir });
        const msg = logResult.stdout.trim();
        expect(msg).toContain('--alcom--');
        expect(msg).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});

test('save with explicit message (no --auto) uses the message', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'alcom-auto-msg-'));

    try {
        gitInit(tmpDir);

        await writeFile(join(tmpDir, 'base.txt'), 'base\n');
        shOrThrow('git', ['add', 'base.txt'], { cwd: tmpDir });
        shOrThrow('git', ['commit', '-m', 'chore: base commit'], { cwd: tmpDir });

        await writeFile(join(tmpDir, 'work.txt'), 'work\n');

        const result = alcomOrThrow(['save', 'my custom message'], tmpDir);
        const parsed = JSON.parse(result.stdout);
        expect(parsed.status).toBe('ok');

        const logResult = shOrThrow('git', ['log', '-1', '--format=%s'], { cwd: tmpDir });
        expect(logResult.stdout.trim()).toBe('--alcom-- my custom message');
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});
