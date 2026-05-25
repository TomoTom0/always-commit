import { Command } from 'commander';
import { spawn } from 'child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import * as git from './git';
import * as state from './state';
import * as session from './session';
import { isAllowed } from './config';
import { setup as runSetup } from './setup';
import { version } from '../package.json';

const program = new Command();

function formatLocalDate(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

program
    .name('always-commit')
    .description('A tool to manage temporary git snapshots during LLM-assisted coding sessions.')
    .version(version)
    .option('-d, --dry-run', 'Simulate the command without making any changes')
    .hook('preAction', async (thisCommand, actionCommand) => {
        const name = actionCommand.name();
        if (name === 'help' || name === 'docs' || actionCommand === thisCommand) return;
        if (!await isAllowed()) {
            console.error('Operation disallowed by ALCOM_ALLOW configuration.');
            process.exit(1);
        }
    })
    .addHelpText('after', `
Examples:
  $ always-commit save "WIP: refactoring"
  $ always-commit status
  $ always-commit finish "feat: complete refactoring"
  `);

function generateAutoMessage(): string {
    return formatLocalDate(new Date());
}

function summarizeDiffStat(entries: git.DiffEntry[]): string {
    if (entries.length === 0) return '';
    const sorted = [...entries].sort((a, b) =>
        (b.added + b.deleted) - (a.added + a.deleted)
    );
    const parts = sorted.map(e => `${e.path} (+${e.added}/-${e.deleted})`);
    const result = parts.join(', ');
    return result.length > 120 ? result.slice(0, 117) + '...' : result;
}

program
    .command('save')
    .description('Save a temporary snapshot of the current working directory.')
    .argument('[message]', 'Commit message for the snapshot', 'WIP: snapshot')
    .option('-f, --force', 'Force commit even if there are no changes')
    .option('--auto', 'Auto-generate message from diff stat')
    .addHelpText('after', `
Example:
  $ always-commit save "WIP: refactoring user auth"
  $ always-commit save --auto
  `)
    .action(async (message, cmdOptions) => {
        try {


            const globalOptions = program.opts();
            const options = { ...globalOptions, ...cmdOptions };

            let commitMessage = message;
            if (options.auto) {
                const entries = await git.getDiffStat();
                if (entries.length > 0) {
                    commitMessage = summarizeDiffStat(entries);
                } else {
                    commitMessage = generateAutoMessage();
                }
            }
            const fullMessage = `--alcom-- ${commitMessage}`;

            if (options.dryRun) {
                console.log(`[Dry Run] Would save snapshot with message: "${fullMessage}"`);
                return;
            }

            const hasChanges = await git.hasChanges();
            if (!hasChanges && !options.force) {
                console.log(JSON.stringify({ status: 'skipped', message: 'No changes detected' }));
                return;
            }

            const hash = await git.commitAll(fullMessage, options.force);
            await state.addCommit(hash, fullMessage);
            console.log(JSON.stringify({ status: 'ok', action: 'save', hash }));
        } catch (error: any) {
            console.error(JSON.stringify({ status: 'error', message: error.message }));
            process.exit(1);
        }
    });

program
    .command('undo')
    .description('Undo the last snapshot and revert files to the previous state.')
    .addHelpText('after', `
Description:
  Reverts the last commit created by 'save' and removes it from the internal history.
  This is a destructive action for the last snapshot, but safe for previous history.
  `)
    .action(async () => {
        try {


            const options = program.opts();

            // Peek at the last commit first
            const lastCommit = await state.getLastCommit();
            if (!lastCommit) {
                throw new Error('No snapshots to undo');
            }

            const currentHead = await git.getCurrentHead();
            if (currentHead !== lastCommit.hash) {
                throw new Error('HEAD does not match the last snapshot. Manual changes detected?');
            }

            const isRoot = await git.isRootCommit(lastCommit.hash);
            if (isRoot) {
                throw new Error('Cannot undo: last commit is a root commit');
            }

            const parentHash = await git.getParentHash(lastCommit.hash);

            if (options.dryRun) {
                console.log(`[Dry Run] Would undo snapshot ${lastCommit.hash} and reset to ${parentHash}`);
                return;
            }

            const hasWorkingChanges = await git.hasChanges();
            if (hasWorkingChanges) {
                throw new Error('Uncommitted changes detected. Commit or stash them before undo.');
            }

            // Git operation first, then state update
            await git.resetHard(parentHash);
            await state.popCommit();

            const snapshotMessage = lastCommit.message.replace('--alcom-- ', '');
            const diffFiles = await git.getDiffNameStatus(parentHash, lastCommit.hash);
            console.log(JSON.stringify({
                status: 'ok',
                action: 'undo',
                hash: lastCommit.hash,
                undoneMessage: snapshotMessage,
                revertedFiles: diffFiles,
                hint: 'Use \'alcom redo\' to restore this snapshot.',
            }));
        } catch (error: any) {
            console.error(JSON.stringify({ status: 'error', message: error.message }));
            process.exit(1);
        }
    });

program
    .command('redo')
    .description('Restore the last undone snapshot.')
    .addHelpText('after', `
Description:
  Restores the most recent snapshot that was undone by 'undo'.
  Consecutive redo is supported as long as there are undone snapshots.
  Running redo when nothing has been undone results in an error.
  `)
    .action(async () => {
        try {
            const options = program.opts();

            const undoneCommit = await state.peekUndoStack();
            if (!undoneCommit) {
                throw new Error('Nothing to redo. No undone snapshots found.');
            }

            if (options.dryRun) {
                console.log(`[Dry Run] Would redo snapshot ${undoneCommit.hash}`);
                return;
            }

            const hasWorkingChanges = await git.hasChanges();
            if (hasWorkingChanges) {
                throw new Error('Uncommitted changes detected. Commit or stash them before redo.');
            }

            await git.resetHard(undoneCommit.hash);
            await state.popUndoStack();
            await state.pushCommit(undoneCommit);

            const snapshotMessage = undoneCommit.message.replace('--alcom-- ', '');
            console.log(JSON.stringify({
                status: 'ok',
                action: 'redo',
                hash: undoneCommit.hash,
                restoredMessage: snapshotMessage,
            }));
        } catch (error: any) {
            console.error(JSON.stringify({ status: 'error', message: error.message }));
            process.exit(1);
        }
    });

program
    .command('finish')
    .description('Squash all temporary snapshots into a single clean commit.')
    .argument('<message>', 'Final commit message')
    .option('-a, --append', 'Append messages of squashed commits to the final message')
    .option('--base <hash>', 'Manually specify the base commit hash for recovery')
    .addHelpText('after', `
Description:
  Resets the branch to the state before the first snapshot (mixed reset),
  keeping all file changes in the working directory.
  Then creates a single new commit with the provided message.
  
Example:
  $ always-commit finish "feat: implement user login"
  $ always-commit finish "feat: implement user login" --append
  $ always-commit finish "restored session" --base a1b2c3d
  `)
    .action(async (message, cmdOptions) => {
        try {


            const options = program.opts();
            let baseHash: string | undefined;

            if (cmdOptions.base) {
                baseHash = cmdOptions.base;
            } else {
                baseHash = await git.findBaseCommit();
            }

            if (!baseHash) {
                // セッションが存在しない場合は、通常のコミットとして動作
                if (options.dryRun) {
                    console.log(`[Dry Run] Would commit changes with message: "${message}"`);
                    return;
                }

                const finalHash = await git.commitAll(message);
                console.log(JSON.stringify({ status: 'ok', action: 'finish', hash: finalHash }));
                return;
            }

            let finalMessage = message;
            if (cmdOptions.append) {
                const commits = await git.getCommits(baseHash);
                // Filter for alcom commits and extract messages
                const commitMessages = commits
                    .filter(c => git.isAlcomCommit(c.message))
                    .map(c => `- ${c.message.replace('--alcom-- ', '')}`);

                if (commitMessages.length > 0) {
                    finalMessage += '\n\n' + commitMessages.join('\n');
                }
            }

            if (options.dryRun) {
                console.log(`[Dry Run] Would reset mixed to ${baseHash}, clear state, and commit with message:`);
                console.log(finalMessage);
                return;
            }

            // EMPTY_TREEの場合（リポジトリの全コミットがalcomコミットの場合）
            // 親なしの新しいルートコミットを作成する
            if (baseHash === git.EMPTY_TREE) {
                const treeHash = await git.getTreeHash('HEAD');
                const newCommit = await git.commitTreeOrphan(treeHash, finalMessage);
                await git.resetHard(newCommit);
                await state.clearState();
                console.log(JSON.stringify({ status: 'ok', action: 'finish', hash: newCommit }));
                return;
            }

            await git.resetMixed(baseHash);
            await state.clearState();

            const finalHash = await git.commitAll(finalMessage);
            console.log(JSON.stringify({ status: 'ok', action: 'finish', hash: finalHash }));
        } catch (error: any) {
            console.error(JSON.stringify({ status: 'error', message: error.message }));
            process.exit(1);
        }
    });

program
    .command('auto-squash')
    .description('Automatically squash save commits into subsequent manual commits.')
    .addHelpText('after', `
Description:
  Rewrites history to merge 'save' commits into the manual commits that follow them.
  Commit messages of manual commits are updated to indicate the merge.
  Trailing 'save' commits (not followed by a manual commit) are preserved but re-parented.
  
Example:
  $ always-commit auto-squash
  `)
    .action(async () => {
        try {


            const options = program.opts();
            const currentSession = await session.getSession();
            if (!currentSession || currentSession.commits.length === 0) {
                throw new Error('No active session (no snapshots found)');
            }
            const firstCommit = currentSession.commits[0];
            if (!firstCommit) throw new Error('Invalid session state');

            const isRoot = await git.isRootCommit(firstCommit.hash);
            if (isRoot) {
                throw new Error('Cannot auto-squash: session starts from root commit');
            }

            const baseHash = await git.getParentHash(firstCommit.hash);
            const commits = await git.getCommits(baseHash);

            if (commits.length === 0) {
                console.log("No commits to process.");
                return;
            }

            // Group commits
            // We want to group sequences of saves + 1 manual commit.
            // Or just trailing saves.

            let newHead = baseHash;
            let pendingSaves: git.CommitInfo[] = [];
            let actions: string[] = [];

            for (const commit of commits) {
                const isSave = git.isAlcomCommit(commit.message);

                if (isSave) {
                    pendingSaves.push(commit);
                } else {
                    // Manual commit found. Squash pending saves into this one.
                    if (pendingSaves.length > 0) {
                        const squashMsg = `\n\nsquash merged with ${pendingSaves.length} commits by always-commit`;
                        const newMessage = commit.message + squashMsg;

                        if (options.dryRun) {
                            actions.push(`Squash ${pendingSaves.length} saves into manual commit ${commit.hash.substring(0, 7)} ("${commit.message}")`);
                            actions.push(`  New message: "${newMessage.replace(/\n/g, '\\n')}"`);
                            newHead = commit.hash; // In dry run, we just track logically
                        } else {
                            // Create new commit with manual commit's tree, but parent is current newHead
                            newHead = await git.commitTree(commit.treeHash, newHead, newMessage);
                        }
                        pendingSaves = [];
                    } else {
                        // Just a manual commit without saves, but we need to re-parent it if history changed
                        // Actually, if we are rewriting, we must rewrite everything after the first change.
                        // Since we start from baseHash, we are rewriting everything.
                        if (options.dryRun) {
                            actions.push(`Pick manual commit ${commit.hash.substring(0, 7)} ("${commit.message}")`);
                            newHead = commit.hash;
                        } else {
                            newHead = await git.commitTree(commit.treeHash, newHead, commit.message);
                        }
                    }
                }
            }

            // Handle trailing saves
            if (pendingSaves.length > 0) {
                if (options.dryRun) {
                    actions.push(`Keep ${pendingSaves.length} trailing saves:`);
                    pendingSaves.forEach(s => actions.push(`  ${s.hash.substring(0, 7)}: ${s.message}`));
                } else {
                    for (const save of pendingSaves) {
                        newHead = await git.commitTree(save.treeHash, newHead, save.message);
                    }
                }
            }

            if (options.dryRun) {
                console.log("[Dry Run] Auto-squash plan:");
                actions.forEach(a => console.log(`- ${a}`));
            } else {
                // Update branch pointer
                const currentBranch = await git.getCurrentBranch();
                await git.updateRef(`refs/heads/${currentBranch}`, newHead);

                // Clear state because we rewrote history, so old hashes in state are invalid.
                // Actually, should we clear state?
                // If we squash, the "save" commits are gone or merged.
                // So yes, the session is effectively "finished" or at least the old state is invalid.
                // But wait, if there are trailing saves, they are still there, just with new hashes.
                // If we want to continue the session, we should update the state with new hashes.
                // But mapping old to new is complex if we squashed some.
                // For simplicity, let's clear state and assume the user is "cleaning up".
                // Or, we could just say "session cleared".
                // The user request didn't specify, but "auto-squash" implies cleaning up.
                // Let's clear state.
                await state.clearState();

                console.log(JSON.stringify({ status: 'ok', action: 'auto-squash', newHead }));
            }

        } catch (error: any) {
            console.error(JSON.stringify({ status: 'error', message: error.message }));
            process.exit(1);
        }
    });

program
    .command('base-hash')
    .description('Get the hash of the commit before the first snapshot.')
    .addHelpText('after', `
Example:
  $ always-commit base-hash
  > a1b2c3d4...
  `)
    .action(async () => {
        try {
            const currentSession = await session.getSession();
            if (!currentSession || currentSession.commits.length === 0) {
                throw new Error('No active session (no snapshots found)');
            }
            const firstCommit = currentSession.commits[0];
            if (!firstCommit) throw new Error('Invalid session state');

            const isRoot = await git.isRootCommit(firstCommit.hash);
            const baseHash = isRoot ? git.EMPTY_TREE : await git.getParentHash(firstCommit.hash);
            console.log(baseHash);
        } catch (error: any) {
            console.error(error.message);
            process.exit(1);
        }
    });

program
    .command('base-update')
    .description('Update session state by finding consecutive --alcom-- commits from HEAD.')
    .addHelpText('after', `
Description:
  Scans the git history from HEAD's parent backwards, collecting consecutive
  --alcom-- commits and updates the session state file accordingly.
  This is useful when the session state becomes corrupted or outdated.

Example:
  $ always-commit base-update
  `)
    .action(async () => {
        try {
            const alcomCommits = await git.findLatestAlcomSession();

            if (alcomCommits.length === 0) {
                await state.clearState();
                console.log(JSON.stringify({ status: 'ok', action: 'base-update', sessionCommits: 0, message: 'No consecutive --alcom-- commits found from HEAD. Session cleared.' }));
                return;
            }

            await state.repairSession(alcomCommits);
            console.log(JSON.stringify({ status: 'ok', action: 'base-update', sessionCommits: alcomCommits.length, firstCommit: alcomCommits[0]?.hash.substring(0, 7), lastCommit: alcomCommits[alcomCommits.length - 1]?.hash.substring(0, 7) }));
        } catch (error: any) {
            console.error(JSON.stringify({ status: 'error', message: error.message }));
            process.exit(1);
        }
    });



program
    .command('git')
    .description('Run a git command with @base placeholder support.')
    .argument('<args...>', 'Git arguments')
    .option('--base <hash>', 'Manually specify the base commit hash for @base')
    .allowUnknownOption()
    .addHelpText('after', `
Description:
  Executes a git command. The string '@base' in the arguments will be replaced
  with the hash of the commit before the session started.
  
Examples:
  $ always-commit git diff --stat @base
  $ always-commit git log --oneline @base..HEAD
  `)
    .action(async (args: string[], cmdOptions) => {
        try {


            let baseHash = 'HEAD';

            if (cmdOptions.base) {
                baseHash = cmdOptions.base;
            } else {
                baseHash = await git.findBaseCommit();
            }

            const processedArgs = args.map(arg => arg.replace('@base', baseHash));

            const proc = spawn('git', processedArgs, {
                stdio: 'inherit',
            });

            proc.on('error', (err) => {
                console.error(`Failed to start git: ${err.message}`);
                process.exit(1);
            });

            proc.on('close', (exitCode) => {
                process.exit(exitCode ?? 1);
            });
        } catch (error: any) {
            console.error(error.message);
            process.exit(1);
        }
    });



program
    .command('status')
    .description('Show changed files since the base commit (first non-alcom commit).')
    .argument('[args...]', 'Additional git diff arguments')
    .option('--base <hash>', 'Manually specify the base commit hash')
    .allowUnknownOption()
    .addHelpText('after', `
Example:
  $ always-commit status
  M  src/index.ts
  A  docs/new-doc.md
  $ always-commit status --stat
  $ always-commit status -- src/
  `)
    .action(async (args: string[], cmdOptions) => {
        try {
            const baseHash = cmdOptions.base || await git.findBaseCommit();

            const proc = spawn('git', ['--no-pager', 'diff', '--name-status', baseHash, ...args], {
                stdio: 'inherit',
            });

            proc.on('error', (err) => {
                console.error(`Failed to start git: ${err.message}`);
                process.exit(1);
            });

            proc.on('close', (exitCode) => {
                process.exit(exitCode ?? 1);
            });
        } catch (error: any) {
            console.error(error.message);
            process.exit(1);
        }
    });

program
    .command('diff')
    .description('Show changes since the base commit (first non-alcom commit).')
    .argument('[args...]', 'Additional git diff arguments')
    .option('--base <hash>', 'Manually specify the base commit hash')
    .allowUnknownOption()
    .addHelpText('after', `
Example:
  $ always-commit diff
  $ always-commit diff --stat
  $ always-commit diff --name-only
  $ always-commit diff -- src/
  `)
    .action(async (args: string[], cmdOptions) => {
        try {
            const baseHash = cmdOptions.base || await git.findBaseCommit();

            const proc = spawn('git', ['--no-pager', 'diff', baseHash, ...args], {
                stdio: 'inherit',
            });

            proc.on('error', (err) => {
                console.error(`Failed to start git: ${err.message}`);
                process.exit(1);
            });

            proc.on('close', (exitCode) => {
                process.exit(exitCode ?? 1);
            });
        } catch (error: any) {
            console.error(error.message);
            process.exit(1);
        }
    });

program
    .command('log')
    .description('List commits in the current session.')
    .option('-n, --number <count>', 'Number of commits to show', '10')
    .option('-a, --all', 'Show all commits (default: only alcom save commits)')
    .addHelpText('after', `
Description:
  Shows commits from the current active session only.
  If there is no active session, nothing is displayed.

Example:
  $ always-commit log
  $ always-commit log --all
  `)
    .action(async (cmdOptions) => {
        try {
            const limit = parseInt(cmdOptions.number, 10);
            if (isNaN(limit) || limit <= 0) {
                throw new Error('Invalid number argument. Must be a positive integer.');
            }

            // Get current session
            const currentSession = await session.getSession();
            if (!currentSession || currentSession.commits.length === 0) {
                // No active session, nothing to show
                return;
            }

            // Show commits from the current session only (newest first)
            const sessionCommits = [...currentSession.commits].reverse().map(c => ({
                hash: c.hash,
                message: c.message,
                date: formatLocalDate(new Date(c.timestamp))
            }));

            // Apply limit
            const commitsToShow = sessionCommits.slice(0, Math.min(limit, sessionCommits.length));

            for (const commit of commitsToShow) {
                const hash = commit.hash.substring(0, 7);
                const date = commit.date;
                const msg = commit.message.length > 30 ? commit.message.substring(0, 27) + '...' : commit.message;
                console.log(`${hash} ${date} ${msg}`);
            }

        } catch (error: any) {
            console.error(JSON.stringify({ status: 'error', message: error.message }));
            process.exit(1);
        }
    });

program
    .command('setup')
    .description('Configure Claude Code integration by registering hooks in settings.json.')
    .option('--project', 'Install to project settings (.claude/settings.json) instead of global (~/.claude/settings.json)')
    .option('--script-dir <dir>', 'Directory to install the hook script', `${os.homedir()}/.local/bin`)
    .addHelpText('after', `
Description:
  Installs the hook script and registers it in Claude Code's settings.json.
  By default, modifies the global settings (~/.claude/settings.json).

  Registered hooks:
    UserPromptSubmit  Save a snapshot on every prompt submission
    PreToolUse        Block git checkout (branch switch only) / git switch when snapshots exist

Examples:
  $ alcom setup
  $ alcom setup --project
  $ alcom setup --script-dir /usr/local/bin
  $ alcom setup --dry-run
  `)
    .action(async (cmdOptions) => {
        try {
            const globalOptions = program.opts();
            const result = await runSetup({
                project: cmdOptions.project ?? false,
                scriptDir: cmdOptions.scriptDir,
                dryRun: globalOptions.dryRun ?? false,
            });

            if (globalOptions.dryRun) {
                console.log('[Dry Run] Setup would make the following changes:');
                console.log(`  Hook script: ${result.scriptPath}`);
                console.log(`  Settings file: ${result.settingsPath}`);
                if (result.userPromptSubmitAdded) console.log('  + UserPromptSubmit hook');
                if (result.preToolUseAdded) console.log('  + PreToolUse branch guard');
            } else {
                console.log('Setup complete.');
                if (result.scriptInstalled) console.log(`  Hook script installed: ${result.scriptPath}`);
                if (result.userPromptSubmitAdded) console.log(`  UserPromptSubmit hook added to: ${result.settingsPath}`);
                if (result.preToolUseAdded) console.log(`  PreToolUse branch guard added to: ${result.settingsPath}`);
                if (!result.userPromptSubmitAdded && !result.preToolUseAdded) {
                    console.log('  Hooks already configured. Nothing to change.');
                }
            }
        } catch (error: any) {
            console.error(error.message);
            process.exit(1);
        }
    });

program
    .command('docs')
    .description('Show documentation.')
    .argument('[topic]', 'Documentation topic (e.g. usage, dev, design)')
    .argument('[file]', 'Specific file within topic (e.g. agent-integration)')
    .addHelpText('after', `
Available topics:
  usage    User guide and command reference
  dev      Developer guide and architecture
  design   Initial design document

Examples:
  $ alcom docs
  $ alcom docs usage
  $ alcom docs usage agent-integration
  $ alcom docs dev
  `)
    .action(async (topic?: string, file?: string) => {
        try {
            const __dirname = path.dirname(fileURLToPath(import.meta.url));
            const docsDir = path.join(__dirname, '..', 'docs');

            if (!topic) {
                let entries: string[];
                try {
                    entries = await readdir(docsDir);
                } catch {
                    console.error('Documentation directory not found.');
                    process.exit(1);
                }
                const topics = entries.filter(e => !e.endsWith('.md'));
                console.log('Available topics:');
                for (const t of topics) {
                    const topicDir = path.join(docsDir, t);
                    let topicFiles: string[];
                    try {
                        topicFiles = (await readdir(topicDir)).filter(f => f.endsWith('.md'));
                    } catch {
                        continue;
                    }
                    if (topicFiles.length === 0) continue;
                    if (topicFiles.length === 1) {
                        console.log(`  ${t}`);
                    } else {
                        console.log(`  ${t}  (${topicFiles.map(f => f.replace(/\.md$/, '')).join(', ')})`);
                    }
                }
                return;
            }

            const topicDir = path.join(docsDir, topic);
            let files: string[];
            try {
                files = await readdir(topicDir);
            } catch {
                console.error(`Unknown topic: "${topic}". Run 'alcom docs' to see available topics.`);
                process.exit(1);
            }

            const mdFiles = files.filter(f => f.endsWith('.md'));
            if (mdFiles.length === 0) {
                console.error(`No documentation found for topic: "${topic}"`);
                process.exit(1);
            }

            if (file) {
                const target = file.endsWith('.md') ? file : `${file}.md`;
                if (!mdFiles.includes(target)) {
                    console.error(`Unknown file: "${file}". Available: ${mdFiles.map(f => f.replace(/\.md$/, '')).join(', ')}`);
                    process.exit(1);
                }
                const content = await readFile(path.join(topicDir, target), 'utf-8');
                console.log(content);
            } else {
                const filename = mdFiles.includes('index.md') ? 'index.md' : mdFiles[0];
                const content = await readFile(path.join(topicDir, filename as string), 'utf-8');
                console.log(content);
                if (mdFiles.length > 1) {
                    const others = mdFiles.filter(f => f !== filename);
                    console.log(`\n--- More in "${topic}": ${others.map(f => f.replace(/\.md$/, '')).join(', ')} ---`);
                    console.log(`Use: alcom docs ${topic} <file>`);
                }
            }
        } catch (error: any) {
            console.error(error.message);
            process.exit(1);
        }
    });

program.parse();
