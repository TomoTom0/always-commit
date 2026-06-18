import { test, expect } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { alcomOrThrow, gitInit, shOrThrow } from './helpers';

test('finish includes all changes after merge commit between saves', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'alcom-test-'));

    try {
        gitInit(tmpDir);

        // Initial commit on default branch
        await writeFile(join(tmpDir, 'main.txt'), 'initial\n');
        shOrThrow('git', ['add', '.'], { cwd: tmpDir });
        shOrThrow('git', ['commit', '-m', 'Initial commit'], { cwd: tmpDir });
        const defaultBranch = shOrThrow('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: tmpDir }).stdout.trim();

        // Create a feature branch with changes
        shOrThrow('git', ['checkout', '-b', 'feature'], { cwd: tmpDir });
        await writeFile(join(tmpDir, 'feature.txt'), 'feature work\n');
        shOrThrow('git', ['add', '.'], { cwd: tmpDir });
        shOrThrow('git', ['commit', '-m', 'Feature work'], { cwd: tmpDir });

        // Switch back to default branch
        shOrThrow('git', ['checkout', defaultBranch], { cwd: tmpDir });

        // First alcom save
        await writeFile(join(tmpDir, 'before-merge.txt'), 'before merge\n');
        alcomOrThrow(['save', 'before merge'], tmpDir);

        // Merge feature branch (creates a merge commit)
        shOrThrow('git', ['merge', 'feature', '--no-ff', '-m', 'Merge feature'], { cwd: tmpDir });

        // Second alcom save
        await writeFile(join(tmpDir, 'after-merge.txt'), 'after merge\n');
        alcomOrThrow(['save', 'after merge'], tmpDir);

        // Finish should include ALL changes: before-merge, feature, after-merge
        alcomOrThrow(['finish', 'feat: all changes'], tmpDir);

        // Verify all files are present in the final commit
        const mainContent = shOrThrow('git', ['show', 'HEAD:main.txt'], { cwd: tmpDir }).stdout;
        expect(mainContent).toContain('initial');

        const beforeMerge = shOrThrow('git', ['show', 'HEAD:before-merge.txt'], { cwd: tmpDir }).stdout;
        expect(beforeMerge).toContain('before merge');

        const featureContent = shOrThrow('git', ['show', 'HEAD:feature.txt'], { cwd: tmpDir }).stdout;
        expect(featureContent).toContain('feature work');

        const afterMerge = shOrThrow('git', ['show', 'HEAD:after-merge.txt'], { cwd: tmpDir }).stdout;
        expect(afterMerge).toContain('after merge');

        // Commit message should be the finish message (not an alcom commit)
        const log = shOrThrow('git', ['log', '-1', '--pretty=%B'], { cwd: tmpDir }).stdout;
        expect(log).toContain('feat: all changes');
        expect(log).not.toContain('--alcom--');
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
}, 60000);

test('status shows all changes after merge commit', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'alcom-test-'));

    try {
        gitInit(tmpDir);

        // Initial commit
        await writeFile(join(tmpDir, 'main.txt'), 'initial\n');
        shOrThrow('git', ['add', '.'], { cwd: tmpDir });
        shOrThrow('git', ['commit', '-m', 'Initial commit'], { cwd: tmpDir });
        const defaultBranch = shOrThrow('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: tmpDir }).stdout.trim();

        // Feature branch
        shOrThrow('git', ['checkout', '-b', 'feature'], { cwd: tmpDir });
        await writeFile(join(tmpDir, 'feature.txt'), 'feature work\n');
        shOrThrow('git', ['add', '.'], { cwd: tmpDir });
        shOrThrow('git', ['commit', '-m', 'Feature work'], { cwd: tmpDir });

        shOrThrow('git', ['checkout', defaultBranch], { cwd: tmpDir });

        // First save
        await writeFile(join(tmpDir, 'before-merge.txt'), 'before merge\n');
        alcomOrThrow(['save', 'before merge'], tmpDir);

        // Merge
        shOrThrow('git', ['merge', 'feature', '--no-ff', '-m', 'Merge feature'], { cwd: tmpDir });

        // Second save
        await writeFile(join(tmpDir, 'after-merge.txt'), 'after merge\n');
        alcomOrThrow(['save', 'after merge'], tmpDir);

        // The key assertion: status command should not break with merge commits
        const statusResult = alcomOrThrow(['status', '--short'], tmpDir);
        expect(statusResult.code).toBe(0);
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
}, 60000);

test('diff shows all changes after merge commit', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'alcom-test-'));

    try {
        gitInit(tmpDir);

        // Initial commit
        await writeFile(join(tmpDir, 'main.txt'), 'initial\n');
        shOrThrow('git', ['add', '.'], { cwd: tmpDir });
        shOrThrow('git', ['commit', '-m', 'Initial commit'], { cwd: tmpDir });
        const defaultBranch = shOrThrow('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: tmpDir }).stdout.trim();

        // Feature branch
        shOrThrow('git', ['checkout', '-b', 'feature'], { cwd: tmpDir });
        await writeFile(join(tmpDir, 'feature.txt'), 'feature work\n');
        shOrThrow('git', ['add', '.'], { cwd: tmpDir });
        shOrThrow('git', ['commit', '-m', 'Feature work'], { cwd: tmpDir });

        shOrThrow('git', ['checkout', defaultBranch], { cwd: tmpDir });

        // First save
        await writeFile(join(tmpDir, 'before-merge.txt'), 'before merge\n');
        alcomOrThrow(['save', 'before merge'], tmpDir);

        // Merge
        shOrThrow('git', ['merge', 'feature', '--no-ff', '-m', 'Merge feature'], { cwd: tmpDir });

        // Second save
        await writeFile(join(tmpDir, 'after-merge.txt'), 'after merge\n');
        alcomOrThrow(['save', 'after merge'], tmpDir);

        // diff should include all files changed since session start
        const diffResult = alcomOrThrow(['diff', '--name-only'], tmpDir);
        expect(diffResult.code).toBe(0);
        expect(diffResult.stdout).toContain('before-merge.txt');
        expect(diffResult.stdout).toContain('feature.txt');
        expect(diffResult.stdout).toContain('after-merge.txt');
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
}, 60000);
