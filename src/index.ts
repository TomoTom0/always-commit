#!/usr/bin/env bun
import { Command } from 'commander';
import * as git from './git';
import * as state from './state';
import * as session from './session';
import { isAllowed } from './config';

const program = new Command();

program
    .name('always-commit')
    .description('A tool to manage temporary git snapshots during LLM-assisted coding sessions.')
    .version('0.0.1')
    .option('-d, --dry-run', 'Simulate the command without making any changes')
    .addHelpText('after', `
Examples:
  $ always-commit save "WIP: refactoring"
  $ always-commit status
  $ always-commit finish "feat: complete refactoring"
  `);

program
    .command('save')
    .description('Save a temporary snapshot of the current working directory.')
    .argument('[message]', 'Commit message for the snapshot', 'WIP: snapshot')
    .option('-f, --force', 'Force commit even if there are no changes')
    .addHelpText('after', `
Example:
  $ always-commit save "WIP: refactoring user auth"
  `)
    .action(async (message, cmdOptions) => {
        try {
            if (!await isAllowed()) {
                console.error('Operation disallowed by ALCOM_ALLOW configuration.');
                process.exit(1);
            }

            const globalOptions = program.opts();
            const options = { ...globalOptions, ...cmdOptions };
            const fullMessage = `--alcom-- ${message}`;

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
            if (!await isAllowed()) {
                console.error('Operation disallowed by ALCOM_ALLOW configuration.');
                process.exit(1);
            }

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

            const parentHash = await git.getParentHash(lastCommit.hash);

            if (options.dryRun) {
                console.log(`[Dry Run] Would undo snapshot ${lastCommit.hash} and reset to ${parentHash}`);
                return;
            }

            // Actually pop and reset
            await state.popCommit();
            await git.resetHard(parentHash);

            console.log(JSON.stringify({ status: 'ok', action: 'undo', hash: lastCommit.hash }));
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
            if (!await isAllowed()) {
                console.error('Operation disallowed by ALCOM_ALLOW configuration.');
                process.exit(1);
            }

            const options = program.opts();
            let baseHash: string | undefined;

            if (cmdOptions.base) {
                baseHash = cmdOptions.base;
            } else {
                const currentSession = await session.getSession();
                if (currentSession && currentSession.commits.length > 0) {
                    const firstCommit = currentSession.commits[0];
                    if (firstCommit) {
                        baseHash = await git.getParentHash(firstCommit.hash);
                    }
                }
            }

            if (!baseHash) {
                // Try session again just to be sure or error out
                throw new Error('No active session found and no --base provided.');
            }

            let finalMessage = message;
            if (cmdOptions.append) {
                const commits = await git.getCommits(baseHash);
                // Filter for alcom commits and extract messages
                const commitMessages = commits
                    .filter(c => c.message.startsWith('--alcom--'))
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
            if (!await isAllowed()) {
                console.error('Operation disallowed by ALCOM_ALLOW configuration.');
                process.exit(1);
            }

            const options = program.opts();
            const currentSession = await session.getSession();
            if (!currentSession || currentSession.commits.length === 0) {
                throw new Error('No active session (no snapshots found)');
            }
            const firstCommit = currentSession.commits[0];
            if (!firstCommit) throw new Error('Invalid session state');

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
                const isSave = commit.message.startsWith('--alcom--');

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
            const baseHash = await git.getParentHash(firstCommit.hash);
            console.log(baseHash);
        } catch (error: any) {
            console.error(error.message);
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
            if (!await isAllowed()) {
                console.error('Operation disallowed by ALCOM_ALLOW configuration.');
                process.exit(1);
            }

            let baseHash = 'HEAD';

            if (cmdOptions.base) {
                baseHash = cmdOptions.base;
            } else {
                const currentSession = await session.getSession();
                if (currentSession && currentSession.commits.length > 0) {
                    const first = currentSession.commits[0];
                    if (first) {
                        baseHash = await git.getParentHash(first.hash);
                    }
                }
            }

            const processedArgs = args.map(arg => arg.replace('@base', baseHash));

            const proc = Bun.spawn(['git', ...processedArgs], {
                stdin: 'inherit',
                stdout: 'inherit',
                stderr: 'inherit',
            });

            const exitCode = await proc.exited;
            process.exit(exitCode);
        } catch (error: any) {
            console.error(error.message);
            process.exit(1);
        }
    });



program
    .command('status')
    .description('Show changed files since the session started (alias for `git diff --name-status @base`).')
    .option('--base <hash>', 'Manually specify the base commit hash')
    .addHelpText('after', `
Example:
  $ always-commit status
  M  src/index.ts
  A  docs/new-doc.md
  `)
    .action(async (cmdOptions) => {
        try {
            let baseHash: string | undefined;

            if (cmdOptions.base) {
                baseHash = cmdOptions.base;
            } else {
                const currentSession = await session.getSession();
                if (!currentSession || currentSession.commits.length === 0) {
                    console.log("No active session.");
                    return;
                }
                const first = currentSession.commits[0];
                if (!first) return;
                baseHash = await git.getParentHash(first.hash);
            }

            if (!baseHash) return;

            const proc = Bun.spawn(['git', 'diff', '--name-status', baseHash], {
                stdin: 'inherit',
                stdout: 'inherit',
                stderr: 'inherit',
            });
            const exitCode = await proc.exited;
            process.exit(exitCode);
        } catch (error: any) {
            console.error(error.message);
            process.exit(1);
        }
    });

program
    .command('diff')
    .description('Show changes since the session started (alias for `git diff @base`).')
    .option('--base <hash>', 'Manually specify the base commit hash')
    .addHelpText('after', `
Example:
  $ always-commit diff
  `)
    .action(async (cmdOptions) => {
        try {
            let baseHash: string | undefined;

            if (cmdOptions.base) {
                baseHash = cmdOptions.base;
            } else {
                const currentSession = await session.getSession();
                if (!currentSession || currentSession.commits.length === 0) {
                    console.log("No active session.");
                    return;
                }
                const first = currentSession.commits[0];
                if (!first) return;
                baseHash = await git.getParentHash(first.hash);
            }

            if (!baseHash) return;

            const proc = Bun.spawn(['git', 'diff', baseHash], {
                stdin: 'inherit',
                stdout: 'inherit',
                stderr: 'inherit',
            });
            const exitCode = await proc.exited;
            process.exit(exitCode);
        } catch (error: any) {
            console.error(error.message);
            process.exit(1);
        }
    });

program
    .command('log')
    .description('List recent commits with filtering options.')
    .option('-n, --number <count>', 'Number of commits to show', '10')
    .option('-a, --all', 'Show all commits (default: only alcom save commits)')
    .option('--manual-depth <count>', 'Include commits up to the N-th manual commit')
    .addHelpText('after', `
Example:
  $ always-commit log
  $ always-commit log --all
  $ always-commit log --manual-depth 2
  `)
    .action(async (cmdOptions) => {
        try {
            const limit = parseInt(cmdOptions.number);
            if (isNaN(limit) || limit <= 0) {
                throw new Error('Invalid number argument. Must be a positive integer.');
            }
            const showAll = cmdOptions.all || false;
            const manualDepth = cmdOptions.manualDepth ? parseInt(cmdOptions.manualDepth) : undefined;
            if (manualDepth !== undefined && (isNaN(manualDepth) || manualDepth < 0)) {
                throw new Error('Invalid manual-depth argument. Must be a non-negative integer.');
            }

            const rawCommits = await git.getLog(1000);

            let commitsToShow: git.CommitInfo[] = [];

            if (manualDepth !== undefined) {
                let manualCount = 0;
                let cutoffIndex = -1;
                for (let i = 0; i < rawCommits.length; i++) {
                    const commit = rawCommits[i];
                    if (!commit) continue;
                    const isSave = commit.message.startsWith('--alcom--');
                    if (!isSave) {
                        manualCount++;
                    }
                    if (manualCount >= manualDepth) {
                        cutoffIndex = i;
                        break;
                    }
                }

                if (cutoffIndex !== -1) {
                    commitsToShow = rawCommits.slice(0, cutoffIndex + 1);
                } else {
                    commitsToShow = rawCommits;
                }

                if (!showAll) {
                    commitsToShow = commitsToShow.filter(c => c.message.startsWith('--alcom--'));
                }
            } else {
                if (showAll) {
                    commitsToShow = rawCommits;
                } else {
                    commitsToShow = rawCommits.filter(c => c.message.startsWith('--alcom--'));
                }
                commitsToShow = commitsToShow.slice(0, limit);
            }

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

program.parse();
