import { describe, it, expect } from 'bun:test';
import { spawnSync } from 'child_process';
import path from 'path';

const CLI = path.join(import.meta.dir, '..', 'src', 'index.ts');

function runDocs(...args: string[]) {
    return spawnSync('bun', [CLI, 'docs', ...args], { encoding: 'utf-8' });
}

describe('docs command', () => {
    it('lists available topics when no argument given', () => {
        const result = runDocs();
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('usage');
        expect(result.stdout).toContain('dev');
        expect(result.stdout).toContain('design');
    });

    it('shows usage documentation', () => {
        const result = runDocs('usage');
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('always-commit');
        expect(result.stdout).toContain('save');
        expect(result.stdout).toContain('finish');
    });

    it('shows dev documentation', () => {
        const result = runDocs('dev');
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('アーキテクチャ');
    });

    it('shows design documentation', () => {
        const result = runDocs('design');
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('always-commit');
    });

    it('exits with error for unknown topic', () => {
        const result = runDocs('nonexistent-topic');
        expect(result.status).toBe(1);
        expect(result.stderr).toContain('Unknown topic');
    });
});
