import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setup } from '../src/setup';
import { readFile, writeFile, rm, mkdir, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'path';
import os from 'os';

const TMP_DIR = path.join(os.tmpdir(), `alcom-setup-test-${process.pid}`);

async function fileExists(p: string): Promise<boolean> {
    try { await access(p, constants.F_OK); return true; } catch { return false; }
}

beforeEach(async () => {
    await mkdir(TMP_DIR, { recursive: true });
});

afterEach(async () => {
    await rm(TMP_DIR, { recursive: true, force: true });
});

describe('setup', () => {
    it('installs hook script and writes settings.json when file does not exist', async () => {
        const scriptDir = path.join(TMP_DIR, 'bin');
        const settingsPath = path.join(TMP_DIR, '.claude', 'settings.json');

        const result = await setup({ project: false, scriptDir, dryRun: false, settingsPathOverride: settingsPath });

        expect(result.scriptInstalled).toBe(true);
        expect(result.userPromptSubmitAdded).toBe(true);
        expect(result.preToolUseAdded).toBe(true);
        expect(await fileExists(path.join(scriptDir, 'alcom-save.sh'))).toBe(true);
        expect(await fileExists(settingsPath)).toBe(true);
    });

    it('writes valid JSON with both hooks to settings.json', async () => {
        const scriptDir = path.join(TMP_DIR, 'bin');
        const settingsPath = path.join(TMP_DIR, '.claude', 'settings.json');

        await setup({ project: false, scriptDir, dryRun: false, settingsPathOverride: settingsPath });

        const content = JSON.parse(await readFile(settingsPath, 'utf-8'));
        expect(content.hooks.UserPromptSubmit).toBeInstanceOf(Array);
        expect(content.hooks.PreToolUse).toBeInstanceOf(Array);
        expect(content.hooks.UserPromptSubmit.length).toBe(1);
        expect(content.hooks.PreToolUse.length).toBe(1);
    });

    it('registers two PreToolUse hook commands: checkout block and switch guard', async () => {
        const scriptDir = path.join(TMP_DIR, 'bin');
        const settingsPath = path.join(TMP_DIR, '.claude', 'settings.json');

        await setup({ project: false, scriptDir, dryRun: false, settingsPathOverride: settingsPath });

        const content = JSON.parse(await readFile(settingsPath, 'utf-8'));
        const preToolUse = content.hooks.PreToolUse[0];
        const commands = preToolUse.hooks.map((h: { command: string }) => h.command);
        expect(commands.length).toBe(2);
        const hasCheckoutBlock = commands.some((c: string) => c.includes('git checkout'));
        const hasSwitchGuard = commands.some((c: string) => c.includes('git switch'));
        expect(hasCheckoutBlock).toBe(true);
        expect(hasSwitchGuard).toBe(true);
    });

    it('replaces existing alcom hooks without adding duplicates', async () => {
        const scriptDir = path.join(TMP_DIR, 'bin');
        const settingsPath = path.join(TMP_DIR, '.claude', 'settings.json');

        await setup({ project: false, scriptDir, dryRun: false, settingsPathOverride: settingsPath });
        const result2 = await setup({ project: false, scriptDir, dryRun: false, settingsPathOverride: settingsPath });

        expect(result2.userPromptSubmitAdded).toBe(true);
        expect(result2.preToolUseAdded).toBe(true);

        const content = JSON.parse(await readFile(settingsPath, 'utf-8'));
        expect(content.hooks.UserPromptSubmit.length).toBe(1);
        expect(content.hooks.PreToolUse.length).toBe(1);
    });

    it('preserves existing hooks in settings.json', async () => {
        const scriptDir = path.join(TMP_DIR, 'bin');
        const settingsPath = path.join(TMP_DIR, '.claude', 'settings.json');
        await mkdir(path.dirname(settingsPath), { recursive: true });
        await writeFile(settingsPath, JSON.stringify({
            hooks: { UserPromptSubmit: [{ matcher: '', hooks: [{ type: 'command', command: 'other-tool' }] }] }
        }), 'utf-8');

        await setup({ project: false, scriptDir, dryRun: false, settingsPathOverride: settingsPath });

        const content = JSON.parse(await readFile(settingsPath, 'utf-8'));
        expect(content.hooks.UserPromptSubmit.length).toBe(2);
    });

    it('dry-run does not write any files', async () => {
        const scriptDir = path.join(TMP_DIR, 'bin');
        const settingsPath = path.join(TMP_DIR, '.claude', 'settings.json');

        const result = await setup({ project: false, scriptDir, dryRun: true, settingsPathOverride: settingsPath });

        expect(result.scriptInstalled).toBe(true);
        expect(result.userPromptSubmitAdded).toBe(true);
        expect(await fileExists(path.join(scriptDir, 'alcom-save.sh'))).toBe(false);
        expect(await fileExists(settingsPath)).toBe(false);
    });
});
