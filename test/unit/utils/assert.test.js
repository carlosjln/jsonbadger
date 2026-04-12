import {describe, expect, test} from '@jest/globals';

import {assert, assert_identifier, assert_path, quote_identifier} from '#src/utils/assert.js';

describe('utils/assert', function () {
	test('assert throws when the condition is true', function () {
		expect(function assert_falsey_condition() {
			assert(false, 'should not throw');
		}).not.toThrow();

		expect(function assert_truthy_condition() {
			assert(true, 'assertion failed');
		}).toThrow('assertion failed');
	});

	test('assert_identifier throws for invalid identifiers and quotes valid ones', function () {
		expect(function assert_invalid_identifier_type() {
			assert_identifier(7, 'field_name');
		}).toThrow('field_name must be a string');

		expect(function assert_invalid_identifier_value() {
			assert_identifier('7bad', 'field_name');
		}).toThrow('field_name has invalid characters');

		expect(quote_identifier('user_name')).toBe('"user_name"');
	});

	test('assert_path throws for invalid dot paths', function () {
		expect(function assert_invalid_path_type() {
			assert_path(null, 'path_name');
		}).toThrow('path_name must be a string');

		expect(function assert_invalid_path_value() {
			assert_path('profile..city', 'path_name');
		}).toThrow('path_name has invalid characters');

		expect(function assert_valid_path() {
			assert_path('profile.city', 'path_name');
		}).not.toThrow();
	});
});
