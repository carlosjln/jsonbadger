import {describe, expect, test} from '@jest/globals';

import {pluralize} from '#src/utils/string.js';

describe('utils/string', function () {
	test('pluralize lowercases and pluralizes common singular words', function () {
		expect(pluralize('User')).toBe('users');
		expect(pluralize('Company')).toBe('companies');
		expect(pluralize('Class')).toBe('classes');
		expect(pluralize('Brush')).toBe('brushes');
		expect(pluralize('Box')).toBe('boxes');
	});
});
