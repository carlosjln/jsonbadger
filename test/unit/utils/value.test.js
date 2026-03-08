import {describe, expect, test} from '@jest/globals';

import {is_function, is_plain_object, is_uuid_v7} from '#src/utils/value.js';

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

	test('is_uuid_v7 validates uuidv7 strings', function () {
		const valid_uuid = '0194f028-579a-7b5b-8107-b9ad31395f43';
		const invalid_uuid = '0194f028-579a-6b5b-8107-b9ad31395f43';

		expect(is_uuid_v7(valid_uuid)).toBe(true);
		expect(is_uuid_v7(invalid_uuid)).toBe(false);
		expect(is_uuid_v7(123)).toBe(false);
	});

	test('is_function only accepts functions', function () {
		expect(is_function(function () {
		})).toBe(true);
		expect(is_function(() => {
		})).toBe(true);
		expect(is_function({})).toBe(false);
		expect(is_function(null)).toBe(false);
	});
});
