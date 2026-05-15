import path from 'path';
import fs from 'fs-extra';
import * as git from './git';

export async function isAllowed(): Promise<boolean> {
    // 1. Check environment variable first (highest priority)
    if (process.env.ALCOM_ALLOW !== undefined) {
        return process.env.ALCOM_ALLOW.toLowerCase() !== 'false';
    }

    try {
        // 2. Find git root
        const gitRoot = await git.getGitRoot();

        // 3. Check .env.local (second priority)
        const localAllowed = await checkEnvFile(path.join(gitRoot, '.env.local'));
        if (localAllowed !== undefined) return localAllowed;

        // 4. Check .env (lowest priority)
        const envAllowed = await checkEnvFile(path.join(gitRoot, '.env'));
        if (envAllowed !== undefined) return envAllowed;

    } catch (error) {
        // If we can't find git root or read files, we assume allowed by default.
        console.warn(`[alcom] Warning: Could not read config. Defaulting to allowed. Error: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Default is allowed
    return true;
}

async function checkEnvFile(filePath: string): Promise<boolean | undefined> {
    if (await fs.pathExists(filePath)) {
        const content = await fs.readFile(filePath, 'utf-8');
        const allowed = parseAlcomAllow(content);
        if (allowed !== undefined) {
            return allowed;
        }
    }
    return undefined;
}

function parseAlcomAllow(content: string): boolean | undefined {
    const lines = content.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#') || trimmed === '') continue;

        // Handle: KEY=VALUE, KEY = VALUE, export KEY=VALUE, trailing comments
        const envLine = trimmed.replace(/^export\s+/, '');
        const match = envLine.match(/^ALCOM_ALLOW\s*=\s*([^#]*)/);
        if (match && match[1] !== undefined) {
            const value = match[1].trim();
            // Remove quotes if present
            const cleanValue = value.replace(/^["']|["']$/g, '');
            return cleanValue.toLowerCase() !== 'false';
        }
    }
    return undefined;
}
