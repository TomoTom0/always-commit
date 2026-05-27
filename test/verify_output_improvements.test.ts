import { test, expect } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { alcom, alcomOrThrow, gitInit, shOrThrow, ROOT, TSX } from './helpers';

test('undo shows remaining snapshot count and status summary on stderr', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'alcom-undo-summary-'));

    try {
        gitInit(tmpDir);

        await writeFile(join(tmpDir, 'base.txt'), 'base\n');
        shOrThrow('git', ['add', 'base.txt'], { cwd: tmpDir });
        shOrThrow('git', ['commit', '-m', 'chore: base commit'], { cwd: tmpDir });

        await writeFile(join(tmpDir, 'a.txt'), 'a\n');
        alcomOrThrow(['save', 'first snapshot'], tmpDir);

        await writeFile(join(tmpDir, 'b.txt'), 'b\n');
        alcomOrThrow(['save', 'second snapshot'], tmpDir);

        const result = alcomOrThrow(['undo'], tmpDir);

        // stdout should still be valid JSON
        const parsed = JSON.parse(result.stdout);
        expect(parsed.status).toBe('ok');
        expect(parsed.action).toBe('undo');

        // stderr should contain remaining count and status
        expect(result.stderr).toContain('1 snapshot remaining');
        expect(result.stderr).toContain('Current changes:');
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});

test('undo shows "0 snapshots remaining" when all undone', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'alcom-undo-last-'));

    try {
        gitInit(tmpDir);

        await writeFile(join(tmpDir, 'base.txt'), 'base\n');
        shOrThrow('git', ['add', 'base.txt'], { cwd: tmpDir });
        shOrThrow('git', ['commit', '-m', 'chore: base commit'], { cwd: tmpDir });

        await writeFile(join(tmpDir, 'a.txt'), 'a\n');
        alcomOrThrow(['save', 'only snapshot'], tmpDir);

        const result = alcomOrThrow(['undo'], tmpDir);

        expect(result.stderr).toContain('0 snapshots remaining');
        expect(result.stderr).toContain('No changes from base.');
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});

test('redo shows remaining snapshot count and status summary on stderr', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'alcom-redo-summary-'));

    try {
        gitInit(tmpDir);

        await writeFile(join(tmpDir, 'base.txt'), 'base\n');
        shOrThrow('git', ['add', 'base.txt'], { cwd: tmpDir });
        shOrThrow('git', ['commit', '-m', 'chore: base commit'], { cwd: tmpDir });

        await writeFile(join(tmpDir, 'a.txt'), 'a\n');
        alcomOrThrow(['save', 'snapshot'], tmpDir);

        alcomOrThrow(['undo'], tmpDir);
        const result = alcomOrThrow(['redo'], tmpDir);

        const parsed = JSON.parse(result.stdout);
        expect(parsed.status).toBe('ok');
        expect(parsed.action).toBe('redo');

        expect(result.stderr).toContain('1 snapshot remaining');
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});

test('status --short shows file count and truncated list', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'alcom-status-short-'));

    try {
        gitInit(tmpDir);

        await writeFile(join(tmpDir, 'base.txt'), 'base\n');
        shOrThrow('git', ['add', 'base.txt'], { cwd: tmpDir });
        shOrThrow('git', ['commit', '-m', 'chore: base commit'], { cwd: tmpDir });

        // Create 25 files
        for (let i = 0; i < 25; i++) {
            await writeFile(join(tmpDir, `file${String(i).padStart(2, '0')}.txt`), `content ${i}\n`);
        }
        alcomOrThrow(['save', 'many files'], tmpDir);

        const result = alcomOrThrow(['status', '--short'], tmpDir);
        expect(result.stdout).toContain('25 files changed:');
        expect(result.stdout).toContain('... and 5 more files');
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});

test('status --short shows all files when few', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'alcom-status-short-few-'));

    try {
        gitInit(tmpDir);

        await writeFile(join(tmpDir, 'base.txt'), 'base\n');
        shOrThrow('git', ['add', 'base.txt'], { cwd: tmpDir });
        shOrThrow('git', ['commit', '-m', 'chore: base commit'], { cwd: tmpDir });

        await writeFile(join(tmpDir, 'a.txt'), 'a\n');
        await writeFile(join(tmpDir, 'b.txt'), 'b\n');
        alcomOrThrow(['save', 'few files'], tmpDir);

        const result = alcomOrThrow(['status', '--short'], tmpDir);
        expect(result.stdout).toContain('2 files changed:');
        expect(result.stdout).toContain('a.txt');
        expect(result.stdout).toContain('b.txt');
        expect(result.stdout).not.toContain('more files');
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});

test('status --short shows "No changes" when clean', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'alcom-status-short-clean-'));

    try {
        gitInit(tmpDir);

        await writeFile(join(tmpDir, 'base.txt'), 'base\n');
        shOrThrow('git', ['add', 'base.txt'], { cwd: tmpDir });
        shOrThrow('git', ['commit', '-m', 'chore: base commit'], { cwd: tmpDir });

        alcomOrThrow(['save', '--force'], tmpDir);
        alcomOrThrow(['finish', 'done'], tmpDir);

        const result = alcomOrThrow(['status', '--short'], tmpDir);
        expect(result.stdout).toContain('No changes.');
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});

test('status default mode is unchanged (piped git output)', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'alcom-status-default-'));

    try {
        gitInit(tmpDir);

        await writeFile(join(tmpDir, 'base.txt'), 'base\n');
        shOrThrow('git', ['add', 'base.txt'], { cwd: tmpDir });
        shOrThrow('git', ['commit', '-m', 'chore: base commit'], { cwd: tmpDir });

        await writeFile(join(tmpDir, 'new.txt'), 'hello\n');
        alcomOrThrow(['save', 'add file'], tmpDir);

        const result = alcomOrThrow(['status'], tmpDir);
        // Default status should show raw git diff name-status output
        expect(result.stdout).toMatch(/A\s+new\.txt/);
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});

test('status default compares with previous snapshot', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'alcom-status-prev-'));

    try {
        gitInit(tmpDir);

        await writeFile(join(tmpDir, 'base.txt'), 'base\n');
        shOrThrow('git', ['add', 'base.txt'], { cwd: tmpDir });
        shOrThrow('git', ['commit', '-m', 'chore: base commit'], { cwd: tmpDir });

        // Save snapshot 1
        await writeFile(join(tmpDir, 'a.txt'), 'a\n');
        await writeFile(join(tmpDir, 'b.txt'), 'b\n');
        alcomOrThrow(['save', 'snap1'], tmpDir);

        // Save snapshot 2
        await writeFile(join(tmpDir, 'c.txt'), 'c\n');
        alcomOrThrow(['save', 'snap2'], tmpDir);

        // Default (depth 1): should show only changes from snap1 -> snap2 (c.txt)
        const result = alcomOrThrow(['status', '--short'], tmpDir);
        expect(result.stdout).toContain('c.txt');
        expect(result.stdout).not.toContain('a.txt');
        expect(result.stdout).not.toContain('b.txt');
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});

test('status --depth 2 compares with 2 snapshots ago', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'alcom-status-depth2-'));

    try {
        gitInit(tmpDir);

        await writeFile(join(tmpDir, 'base.txt'), 'base\n');
        shOrThrow('git', ['add', 'base.txt'], { cwd: tmpDir });
        shOrThrow('git', ['commit', '-m', 'chore: base commit'], { cwd: tmpDir });

        // Save snapshot 1
        await writeFile(join(tmpDir, 'a.txt'), 'a\n');
        alcomOrThrow(['save', 'snap1'], tmpDir);

        // Save snapshot 2
        await writeFile(join(tmpDir, 'b.txt'), 'b\n');
        alcomOrThrow(['save', 'snap2'], tmpDir);

        // Save snapshot 3
        await writeFile(join(tmpDir, 'c.txt'), 'c\n');
        alcomOrThrow(['save', 'snap3'], tmpDir);

        // depth 2: snap1 -> HEAD, should show b.txt, c.txt (a.txt already in snap1)
        const result = alcomOrThrow(['status', '--depth', '2', '--short'], tmpDir);
        expect(result.stdout).toContain('b.txt');
        expect(result.stdout).toContain('c.txt');
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});

test('status --base compares with session start', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'alcom-status-base-'));

    try {
        gitInit(tmpDir);

        await writeFile(join(tmpDir, 'base.txt'), 'base\n');
        shOrThrow('git', ['add', 'base.txt'], { cwd: tmpDir });
        shOrThrow('git', ['commit', '-m', 'chore: base commit'], { cwd: tmpDir });

        // Save snapshot 1
        await writeFile(join(tmpDir, 'a.txt'), 'a\n');
        alcomOrThrow(['save', 'snap1'], tmpDir);

        // Save snapshot 2
        await writeFile(join(tmpDir, 'b.txt'), 'b\n');
        alcomOrThrow(['save', 'snap2'], tmpDir);

        // --base: should show all files since base
        const result = alcomOrThrow(['status', '--base', '--short'], tmpDir);
        expect(result.stdout).toContain('a.txt');
        expect(result.stdout).toContain('b.txt');
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});

test('status depth exceeding snapshots falls back to base', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'alcom-status-depth-fallback-'));

    try {
        gitInit(tmpDir);

        await writeFile(join(tmpDir, 'base.txt'), 'base\n');
        shOrThrow('git', ['add', 'base.txt'], { cwd: tmpDir });
        shOrThrow('git', ['commit', '-m', 'chore: base commit'], { cwd: tmpDir });

        // Only 1 snapshot
        await writeFile(join(tmpDir, 'a.txt'), 'a\n');
        alcomOrThrow(['save', 'snap1'], tmpDir);

        // depth 5 exceeds available snapshots, should fall back to base
        const result = alcomOrThrow(['status', '--depth', '5', '--short'], tmpDir);
        expect(result.stdout).toContain('a.txt');
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});

test('log strips --alcom-- prefix', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'alcom-log-prefix-'));

    try {
        gitInit(tmpDir);

        await writeFile(join(tmpDir, 'base.txt'), 'base\n');
        shOrThrow('git', ['add', 'base.txt'], { cwd: tmpDir });
        shOrThrow('git', ['commit', '-m', 'chore: base commit'], { cwd: tmpDir });

        await writeFile(join(tmpDir, 'work.txt'), 'work\n');
        alcomOrThrow(['save', 'WIP: refactoring'], tmpDir);

        const result = alcomOrThrow(['log'], tmpDir);
        expect(result.stdout).not.toContain('--alcom--');
        expect(result.stdout).toContain('WIP: refactoring');
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});

test('log --long shows full message without truncation', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'alcom-log-long-'));

    try {
        gitInit(tmpDir);

        await writeFile(join(tmpDir, 'base.txt'), 'base\n');
        shOrThrow('git', ['add', 'base.txt'], { cwd: tmpDir });
        shOrThrow('git', ['commit', '-m', 'chore: base commit'], { cwd: tmpDir });

        await writeFile(join(tmpDir, 'work.txt'), 'work\n');
        const longMsg = 'This is a very long commit message that exceeds sixty characters and should be truncated by default';
        alcomOrThrow(['save', longMsg], tmpDir);

        const result = alcomOrThrow(['log', '--long'], tmpDir);
        expect(result.stdout).toContain(longMsg);
        expect(result.stdout).not.toContain('...');
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});

test('log default truncation is 60 characters', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'alcom-log-trunc-'));

    try {
        gitInit(tmpDir);

        await writeFile(join(tmpDir, 'base.txt'), 'base\n');
        shOrThrow('git', ['add', 'base.txt'], { cwd: tmpDir });
        shOrThrow('git', ['commit', '-m', 'chore: base commit'], { cwd: tmpDir });

        await writeFile(join(tmpDir, 'work.txt'), 'work\n');
        const longMsg = 'This is a very long commit message that exceeds sixty characters and should be truncated by default';
        alcomOrThrow(['save', longMsg], tmpDir);

        const result = alcomOrThrow(['log'], tmpDir);
        // Should contain truncated version (57 chars + ...)
        expect(result.stdout).toContain('...');
        expect(result.stdout).not.toContain(longMsg);
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});

test('CODING_AGENT_ROOT overrides working directory', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'alcom-agent-root-'));
    const workDir = await mkdtemp(join(tmpdir(), 'alcom-agent-root-work-'));

    try {
        gitInit(tmpDir);

        await writeFile(join(tmpDir, 'base.txt'), 'base\n');
        shOrThrow('git', ['add', 'base.txt'], { cwd: tmpDir });
        shOrThrow('git', ['commit', '-m', 'chore: base commit'], { cwd: tmpDir });

        // Run alcom from workDir (not a git repo) with CODING_AGENT_ROOT pointing to tmpDir
        const result = spawnSync(TSX, [join(ROOT, 'src', 'index.ts'), 'status', '--short'], {
            cwd: workDir,
            encoding: 'utf-8',
            env: { ...process.env, CODING_AGENT_ROOT: tmpDir },
        });

        expect(result.status).toBe(0);
        expect(result.stdout).toContain('No changes.');
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
        await rm(workDir, { recursive: true, force: true });
    }
});

test('CODING_AGENT_ROOT with missing .git produces error', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'alcom-agent-root-no-git-'));
    const workDir = await mkdtemp(join(tmpdir(), 'alcom-agent-root-no-git-work-'));

    try {
        const result = spawnSync(TSX, [join(ROOT, 'src', 'index.ts'), 'status'], {
            cwd: workDir,
            encoding: 'utf-8',
            env: { ...process.env, CODING_AGENT_ROOT: tmpDir },
        });

        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('.git not found');
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
        await rm(workDir, { recursive: true, force: true });
    }
});
