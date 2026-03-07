import {describe, expect, test} from '@jest/globals';

import {is_plain_object} from '#src/utils/value.js';

function CustomInstance() {
	this.ok = true;
}

describe('utils/value', function () {
	test('is_plain_object only accepts null-prototype and default-prototype objects', function () {
		expect(is_plain_object({ok: true})).toBe(true);
		expect(is_plain_object(Object.create(null))).toBe(true);

		expect(is_plain_object(new CustomInstance())).toBe(false);
		expect(is_plain_object(new Date())).toBe(false);
		expect(is_plain_object(new Map())).toBe(false);
		expect(is_plain_object([])).toBe(false);
		expect(is_plain_object(null)).toBe(false);
	});
});
