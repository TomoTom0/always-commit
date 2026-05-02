import { test, expect } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { alcomOrThrow, gitInit, shOrThrow } from './helpers';

test('findBaseCommit handles 120+ alcom commits without severing history', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'alcom-many-'));
    const ALCOM_COUNT = 120;

    try {
        gitInit(tmpDir);

        await writeFile(join(tmpDir, 'base.txt'), 'base\n');
        shOrThrow('git', ['add', 'base.txt'], { cwd: tmpDir });
        shOrThrow('git', ['commit', '-m', 'chore: base commit'], { cwd: tmpDir });

        const baseHash = shOrThrow('git', ['rev-parse', 'HEAD'], { cwd: tmpDir }).stdout.trim();

        for (let i = 0; i < ALCOM_COUNT; i++) {
            await writeFile(join(tmpDir, `work-${i}.txt`), `alcom-${i}\n`);
            alcomOrThrow(['save', `save ${i}`], tmpDir);
        }

        const totalBefore = parseInt(shOrThrow('git', ['rev-list', '--count', 'HEAD'], { cwd: tmpDir }).stdout.trim(), 10);
        expect(totalBefore).toBe(ALCOM_COUNT + 1);

        const finishOut = alcomOrThrow(['finish', 'feat: complete'], tmpDir).stdout;
        const result = JSON.parse(finishOut);
        expect(result.status).toBe('ok');

        const parentHash = shOrThrow('git', ['rev-parse', 'HEAD^'], { cwd: tmpDir }).stdout.trim();
        expect(parentHash).toBe(baseHash);

        const totalAfter = parseInt(shOrThrow('git', ['rev-list', '--count', 'HEAD'], { cwd: tmpDir }).stdout.trim(), 10);
        expect(totalAfter).toBe(2);

        const files = shOrThrow('git', ['ls-tree', '-r', 'HEAD', '--name-only'], { cwd: tmpDir }).stdout;
        for (let i = 0; i < ALCOM_COUNT; i++) {
            expect(files).toContain(`work-${i}.txt`);
        }
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
}, 300000);
