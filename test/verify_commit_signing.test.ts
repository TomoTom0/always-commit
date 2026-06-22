import { test, expect } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { alcomOrThrow, gitInit, shOrThrow } from './helpers';

function gitSshSigningAvailable(): boolean {
    try {
        const r = spawnSync('ssh-keygen', ['-V'], { encoding: 'utf-8' });
        const sshAvailable = r.status === 0 || /usage/i.test(r.stderr) || /unknown/i.test(r.stderr);
        if (!sshAvailable) return false;

        const gitVer = spawnSync('git', ['--version'], { encoding: 'utf-8' });
        const match = gitVer.stdout.match(/git version (\d+)\.(\d+)/);
        if (match) {
            const major = parseInt(match[1], 10);
            const minor = parseInt(match[2], 10);
            return major > 2 || (major === 2 && minor >= 34);
        }
    } catch {
        return false;
    }
    return false;
}

async function setupSigningRepo(tmpDir: string): Promise<void> {
    const keyDir = join(tmpDir, '.ssh', 'signing_key');
    await mkdir(join(tmpDir, '.ssh'), { recursive: true });
    shOrThrow('ssh-keygen', ['-t', 'ed25519', '-N', '', '-f', keyDir, '-C', 'alcom-test@example.com'], { cwd: tmpDir });
    const pubPath = `${keyDir}.pub`;
    expect(existsSync(pubPath)).toBe(true);

    const pubKey = (await readFile(pubPath, 'utf-8')).trim();
    const allowedSignersPath = join(tmpDir, '.ssh', 'allowed_signers');
    await writeFile(allowedSignersPath, `alcom-test@example.com ${pubKey}\n`);

    shOrThrow('git', ['config', 'gpg.format', 'ssh'], { cwd: tmpDir });
    shOrThrow('git', ['config', 'user.signingkey', pubPath], { cwd: tmpDir });
    shOrThrow('git', ['config', 'gpg.ssh.allowedSignersFile', allowedSignersPath], { cwd: tmpDir });
    shOrThrow('git', ['config', 'commit.gpgsign', 'true'], { cwd: tmpDir });
}

test.skipIf(!gitSshSigningAvailable())('finish produces a signed commit when commit.gpgsign=true with ssh key', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'alcom-sign-'));
    try {
        gitInit(tmpDir);
        await setupSigningRepo(tmpDir);

        await writeFile(join(tmpDir, 'file1.txt'), 'initial\n');
        alcomOrThrow(['save', 'first snapshot'], tmpDir);

        await writeFile(join(tmpDir, 'file2.txt'), 'second\n');
        alcomOrThrow(['save', 'second snapshot'], tmpDir);

        const finishOut = alcomOrThrow(['finish', 'feat: signed squash'], tmpDir).stdout;
        const result = JSON.parse(finishOut);
        expect(result.status).toBe('ok');

        const signFlag = shOrThrow('git', ['log', '-1', '--pretty=%G?'], { cwd: tmpDir }).stdout.trim();
        expect(signFlag).toBe('G');
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
}, 60000);

test('finish leaves commit unsigned when commit.gpgsign=false', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'alcom-nosign-'));
    try {
        gitInit(tmpDir);
        shOrThrow('git', ['config', 'commit.gpgsign', 'false'], { cwd: tmpDir });

        await writeFile(join(tmpDir, 'file1.txt'), 'initial\n');
        alcomOrThrow(['save', 'first snapshot'], tmpDir);

        const finishOut = alcomOrThrow(['finish', 'feat: unsigned squash'], tmpDir).stdout;
        const result = JSON.parse(finishOut);
        expect(result.status).toBe('ok');

        const signFlag = shOrThrow('git', ['log', '-1', '--pretty=%G?'], { cwd: tmpDir }).stdout.trim();
        expect(signFlag).toBe('N');
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
}, 60000);

test.skipIf(!gitSshSigningAvailable())('save produces a signed commit when commit.gpgsign=true with ssh key', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'alcom-save-sign-'));
    try {
        gitInit(tmpDir);
        await setupSigningRepo(tmpDir);

        await writeFile(join(tmpDir, 'file1.txt'), 'initial\n');
        alcomOrThrow(['save', 'signed snapshot'], tmpDir);

        const signFlag = shOrThrow('git', ['log', '-1', '--pretty=%G?'], { cwd: tmpDir }).stdout.trim();
        expect(signFlag).toBe('G');
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
}, 60000);
