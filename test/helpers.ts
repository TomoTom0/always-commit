import { spawnSync, type SpawnSyncOptions } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const helpersDir = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(helpersDir, '..');
export const ALCOM_TS = join(ROOT, 'src', 'index.ts');
export const TSX = join(ROOT, 'node_modules', '.bin', 'tsx');

export interface RunResult {
    stdout: string;
    stderr: string;
    code: number;
}

export function sh(cmd: string, args: string[], options: SpawnSyncOptions & { cwd: string }): RunResult {
    const result = spawnSync(cmd, args, { encoding: 'utf-8', ...options });
    return {
        stdout: typeof result.stdout === 'string' ? result.stdout : '',
        stderr: typeof result.stderr === 'string' ? result.stderr : '',
        code: result.status ?? 1,
    };
}

export function shOrThrow(cmd: string, args: string[], options: SpawnSyncOptions & { cwd: string }): RunResult {
    const r = sh(cmd, args, options);
    if (r.code !== 0) {
        throw new Error(`${cmd} ${args.join(' ')} failed (code ${r.code}):\n${r.stderr}\n${r.stdout}`);
    }
    return r;
}

export function alcom(args: string[], cwd: string): RunResult {
    return sh(TSX, [ALCOM_TS, ...args], { cwd });
}

export function alcomOrThrow(args: string[], cwd: string): RunResult {
    return shOrThrow(TSX, [ALCOM_TS, ...args], { cwd });
}

export function gitInit(cwd: string): void {
    shOrThrow('git', ['init'], { cwd });
    shOrThrow('git', ['config', 'user.name', 'Test User'], { cwd });
    shOrThrow('git', ['config', 'user.email', 'test@example.com'], { cwd });
}
