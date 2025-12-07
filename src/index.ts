#!/usr/bin/env bun
import { Command } from 'commander';
import * as git from './git';
import * as state from './state';

const program = new Command();

program
    .name('always-commit')
    .description('A tool to manage temporary git snapshots during LLM-assisted coding sessions.')
    .version('0.0.1');

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
            const hash = await git.commitAll(message);
            await state.addCommit(hash, message);
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

program.parse();
