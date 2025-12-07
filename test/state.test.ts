import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as state from '../src/state';
import fs from 'fs-extra';
import path from 'path';

const TEST_STATE_FILE = '.test-always-commit.json';

describe('State Management', () => {
    beforeEach(async () => {
        state.setStateFile(TEST_STATE_FILE);
        await fs.remove(TEST_STATE_FILE);
    });

    afterEach(async () => {
        await fs.remove(TEST_STATE_FILE);
    });

    it('should load default state when file does not exist', async () => {
        const s = await state.loadState();
        expect(s.commits).toEqual([]);
    });

    it('should save and load state', async () => {
        const s = { commits: [{ hash: 'abc', message: 'test', timestamp: 123 }] };
        await state.saveState(s);
        const loaded = await state.loadState();
        expect(loaded).toEqual(s);
    });

    it('should add a commit', async () => {
        await state.addCommit('hash1', 'msg1');
        const s = await state.loadState();
        expect(s.commits).toHaveLength(1);
        expect(s.commits[0].hash).toBe('hash1');
        expect(s.commits[0].message).toBe('msg1');
    });

    it('should pop a commit', async () => {
        await state.addCommit('hash1', 'msg1');
        await state.addCommit('hash2', 'msg2');

        const popped = await state.popCommit();
        expect(popped?.hash).toBe('hash2');

        const s = await state.loadState();
        expect(s.commits).toHaveLength(1);
        expect(s.commits[0].hash).toBe('hash1');
    });

    it('should clear state', async () => {
        await state.addCommit('hash1', 'msg1');
        await state.clearState();
        const exists = await fs.pathExists(TEST_STATE_FILE);
        expect(exists).toBe(false);
    });
});
