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
        const envLocalPath = path.join(gitRoot, '.env.local');
        if (await fs.pathExists(envLocalPath)) {
            const content = await fs.readFile(envLocalPath, 'utf-8');
            const allowed = parseAlcomAllow(content);
            if (allowed !== undefined) {
                return allowed;
            }
        }

        // 4. Check .env (lowest priority)
        const envPath = path.join(gitRoot, '.env');
        if (await fs.pathExists(envPath)) {
            const content = await fs.readFile(envPath, 'utf-8');
            const allowed = parseAlcomAllow(content);
            if (allowed !== undefined) {
                return allowed;
            }
        }
    } catch (error) {
        // If we can't find git root or read files, we assume allowed by default,
        // or maybe we should log a warning?
        // For now, fail safe -> allow, as this is an opt-out feature.
        // But wait, if git root is not found, we are probably not in a repo,
        // so git commands will fail anyway.
    }

    // Default is allowed
    return true;
}

function parseAlcomAllow(content: string): boolean | undefined {
    const lines = content.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#') || trimmed === '') continue;

        // Simple parsing: KEY=VALUE
        const match = trimmed.match(/^ALCOM_ALLOW=(.*)$/);
        if (match && match[1] !== undefined) {
            const value = match[1].trim();
            // Remove quotes if present
            const cleanValue = value.replace(/^["']|["']$/g, '');
            return cleanValue.toLowerCase() !== 'false';
        }
    }
    return undefined;
}
