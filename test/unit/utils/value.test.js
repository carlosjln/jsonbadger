import {describe, expect, test} from '@jest/globals';

import {
	get_if,
	is_boolean,
	is_function,
	is_integer_string,
	is_number,
	is_plain_object,
	is_uuid_v7,
	to_number
} from '#src/utils/value.js';

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

	test('is_integer_string only accepts digit-only integer strings', function () {
		expect(is_integer_string('12')).toBe(true);
		expect(is_integer_string('0')).toBe(true);
		expect(is_integer_string('12.5')).toBe(false);
		expect(is_integer_string('-1')).toBe(false);
		expect(is_integer_string(12)).toBe(false);
	});

	test('is_number only accepts number primitives', function () {
		expect(is_number(12)).toBe(true);
		expect(is_number(12.5)).toBe(true);
		expect(is_number(NaN)).toBe(true);
		expect(is_number('12')).toBe(false);
		expect(is_number(null)).toBe(false);
	});

	test('to_number coerces numeric values and falls back to zero for invalid input', function () {
		expect(to_number('12.5')).toBe(12.5);
		expect(to_number(8)).toBe(8);
		expect(to_number(0)).toBe(0);
		expect(to_number('')).toBe(0);
		expect(to_number(null)).toBe(0);
		expect(to_number(undefined)).toBe(0);
		expect(to_number('not-a-number')).toBe(0);
		expect(to_number(Infinity)).toBe(0);
	});

	test('is_function only accepts functions', function () {
		expect(is_function(function () {
		})).toBe(true);
		expect(is_function(() => {
		})).toBe(true);
		expect(is_function({})).toBe(false);
		expect(is_function(null)).toBe(false);
	});

	test('is_boolean only accepts booleans', function () {
		expect(is_boolean(true)).toBe(true);
		expect(is_boolean(false)).toBe(true);
		expect(is_boolean(0)).toBe(false);
		expect(is_boolean('true')).toBe(false);
		expect(is_boolean(null)).toBe(false);
	});

	test('get_if returns the value when the evaluator passes and the fallback otherwise', function () {
		expect(get_if(
			function is_positive(value) {
				return value > 0;
			},
			5,
			0
		)).toBe(5);

		expect(get_if(
			function is_positive(value) {
				return value > 0;
			},
			-1,
			0
		)).toBe(0);
	});
});
