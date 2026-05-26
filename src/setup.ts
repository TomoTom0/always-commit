import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { readFile, writeFile, mkdir, copyFile, access, chmod } from 'node:fs/promises';
import { constants } from 'node:fs';
import * as git from './git';

export interface SetupOptions {
    project: boolean;
    scriptDir: string;
    dryRun: boolean;
    /** Override settings.json path (for testing) */
    settingsPathOverride?: string;
}

export interface SetupResult {
    scriptInstalled: boolean;
    scriptPath: string;
    settingsPath: string;
    userPromptSubmitAdded: boolean;
    preToolUseAdded: boolean;
}

async function fileExists(filePath: string): Promise<boolean> {
    try {
        await access(filePath, constants.F_OK);
        return true;
    } catch {
        return false;
    }
}

async function readJson(filePath: string): Promise<Record<string, unknown>> {
    if (!await fileExists(filePath)) return {};
    const content = await readFile(filePath, 'utf-8');
    try {
        return JSON.parse(content);
    } catch {
        throw new Error(`Failed to parse ${filePath}: invalid JSON`);
    }
}

function isAlcomHookPresent(hooks: unknown[]): boolean {
    return hooks.some((h) => {
        if (typeof h !== 'object' || h === null) return false;
        const hook = h as Record<string, unknown>;
        const innerHooks = hook['hooks'];
        if (!Array.isArray(innerHooks)) return false;
        return innerHooks.some((inner) => {
            if (typeof inner !== 'object' || inner === null) return false;
            const cmd = (inner as Record<string, unknown>)['command'];
            return typeof cmd === 'string' && cmd.includes('alcom');
        });
    });
}

export async function setup(options: SetupOptions): Promise<SetupResult> {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const hookScriptSrc = path.join(__dirname, '..', 'scripts', 'claude-code-hook.sh');
    const scriptPath = path.join(options.scriptDir, 'alcom-save.sh');

    const settingsPath = options.settingsPathOverride ?? (
        options.project
            ? path.join(await git.getGitRoot(), '.claude', 'settings.json')
            : path.join(os.homedir(), '.claude', 'settings.json')
    );

    const result: SetupResult = {
        scriptInstalled: false,
        scriptPath,
        settingsPath,
        userPromptSubmitAdded: false,
        preToolUseAdded: false,
    };

    // Install hook script
    if (!options.dryRun) {
        await mkdir(options.scriptDir, { recursive: true });
        await copyFile(hookScriptSrc, scriptPath);
        // Make executable
        await chmod(scriptPath, 0o755);
    }
    result.scriptInstalled = true;

    // Read existing settings
    const settings = await readJson(settingsPath);
    let modified = false;

    if (typeof settings['hooks'] !== 'object' || settings['hooks'] === null) {
        settings['hooks'] = {};
    }
    const hooks = settings['hooks'] as Record<string, unknown>;

    // Add UserPromptSubmit hook
    if (!Array.isArray(hooks['UserPromptSubmit'])) {
        hooks['UserPromptSubmit'] = [];
    }
    const userPromptHooks = hooks['UserPromptSubmit'] as unknown[];
    if (!isAlcomHookPresent(userPromptHooks)) {
        userPromptHooks.push({
            matcher: '',
            hooks: [{ type: 'command', command: scriptPath }],
        });
        result.userPromptSubmitAdded = true;
        modified = true;
    }

    // Add PreToolUse guards: block git checkout entirely, guard git switch when alcom has snapshots
    if (!Array.isArray(hooks['PreToolUse'])) {
        hooks['PreToolUse'] = [];
    }
    const preToolUseHooks = hooks['PreToolUse'] as unknown[];
    if (!isAlcomHookPresent(preToolUseHooks)) {
        preToolUseHooks.push({
            matcher: 'Bash',
            hooks: [
                {
                    type: 'command',
                    command:
                        'cmd=$(jq -r \'.tool_input.command // ""\' 2>/dev/null); ' +
                        'if echo "$cmd" | grep -qE \'^\\s*git checkout\\b\'; then ' +
                        'printf \'{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": "git checkout は使用禁止です。ブランチ切替には git switch、ファイル復元には git restore を使用してください。"}}\'; ' +
                        'fi',
                },
                {
                    type: 'command',
                    command:
                        'cmd=$(jq -r \'.tool_input.command // ""\' 2>/dev/null); ' +
                        'if echo "$cmd" | grep -qE \'^\\s*git switch\\b\'; then ' +
                        'if [ -n "$(alcom log 2>/dev/null)" ]; then ' +
                        'printf \'{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": "alcomの未完了スナップショットがあります。ブランチ切替前に alcom finish でスナップショットをまとめてください。不要なスナップショットは alcom undo で取り消せます。"}}\'; ' +
                        'fi; fi',
                },
            ],
        });
        result.preToolUseAdded = true;
        modified = true;
    }

    if (modified && !options.dryRun) {
        await mkdir(path.dirname(settingsPath), { recursive: true });
        await writeFile(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
    }

    return result;
}
