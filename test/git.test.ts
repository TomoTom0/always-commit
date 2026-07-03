import { describe, it, expect } from 'vitest';
import { isGpgSignEnabled } from '../src/git';

describe('isGpgSignEnabled', () => {
    it.each([
        ['true', true],
        ['True', true],
        ['TRUE', true],
        ['1', true],
        ['yes', true],
        ['Yes', true],
        ['on', true],
        [' true ', true],
        ['\n1\n', true],
        ['false', false],
        ['0', false],
        ['no', false],
        ['off', false],
        ['', false],
        ['  ', false],
        ['anything-else', false],
    ])('returns %j for config value %j', (value, expected) => {
        expect(isGpgSignEnabled(value)).toBe(expected);
    });
});
