#!/usr/bin/env bun
import { Command } from 'commander';
import * as git from './git';
import * as state from './state';

const program = new Command();

program
    .name('always-commit')
    .description('A tool to manage temporary git snapshots during LLM-assisted coding sessions.')
    .version('0.0.1')
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
    .addHelpText('after', `
Example:
  $ always-commit save "WIP: refactoring user auth"
  `)
    .action(async (message) => {
        try {
            const fullMessage = `--alcom-- ${message}`;
            const hash = await git.commitAll(fullMessage);
            await state.addCommit(hash, fullMessage);
            console.log(JSON.stringify({ status: 'ok', action: 'save', hash }));
        } catch (error: any) {
            console.log(JSON.stringify({ status: 'error', message: error.message }));
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
            const lastCommit = await state.popCommit();
            if (!lastCommit) {
                throw new Error('No snapshots to undo');
            }

            const currentHead = await git.getCurrentHead();
            if (currentHead !== lastCommit.hash) {
                throw new Error('HEAD does not match the last snapshot. Manual changes detected?');
            }

            const parentHash = await git.getParentHash(lastCommit.hash);
            await git.resetHard(parentHash);

            console.log(JSON.stringify({ status: 'ok', action: 'undo', hash: lastCommit.hash }));
        } catch (error: any) {
            console.log(JSON.stringify({ status: 'error', message: error.message }));
            process.exit(1);
        }
    });

program
    .command('finish')
    .description('Squash all temporary snapshots into a single clean commit.')
    .argument('<message>', 'Final commit message')
    .addHelpText('after', `
Description:
  Resets the branch to the state before the first snapshot (mixed reset),
  keeping all file changes in the working directory.
  Then creates a single new commit with the provided message.
  
Example:
  $ always-commit finish "feat: implement user login"
  `)
    .action(async (message) => {
        try {
            const firstCommit = await state.getFirstCommit();
            if (!firstCommit) {
                throw new Error('No snapshots to finish');
            }

            const baseHash = await git.getParentHash(firstCommit.hash);
            await git.resetMixed(baseHash);
            await state.clearState();

            const finalHash = await git.commitAll(message);
            console.log(JSON.stringify({ status: 'ok', action: 'finish', hash: finalHash }));
        } catch (error: any) {
            console.log(JSON.stringify({ status: 'error', message: error.message }));
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
            const firstCommit = await state.getFirstCommit();
            if (!firstCommit) {
                throw new Error('No active session (no snapshots found)');
            }
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
    .allowUnknownOption()
    .addHelpText('after', `
Description:
  Executes a git command. The string '@base' in the arguments will be replaced
  with the hash of the commit before the session started.
  
Examples:
  $ always-commit git diff --stat @base
  $ always-commit git log --oneline @base..HEAD
  `)
    .action(async (args: string[]) => {
        try {
            const firstCommit = await state.getFirstCommit();
            let baseHash = 'HEAD'; // Default if no session, though maybe should error?

            if (firstCommit) {
                baseHash = await git.getParentHash(firstCommit.hash);
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
    .addHelpText('after', `
Example:
  $ always-commit status
  M  src/index.ts
  A  docs/new-doc.md
  `)
    .action(async () => {
        // Re-use logic or just spawn? Spawning is easier to keep DRY if I extract the runner, but for now just copy-paste or call the action if possible.
        // Commander actions are functions.
        // Let's just spawn directly to avoid argument parsing issues.
        try {
            const firstCommit = await state.getFirstCommit();
            if (!firstCommit) {
                console.log("No active session.");
                return;
            }
            const baseHash = await git.getParentHash(firstCommit.hash);

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
    .addHelpText('after', `
Example:
  $ always-commit diff
  `)
    .action(async () => {
        try {
            const firstCommit = await state.getFirstCommit();
            if (!firstCommit) {
                console.log("No active session.");
                return;
            }
            const baseHash = await git.getParentHash(firstCommit.hash);

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

program.parse();
