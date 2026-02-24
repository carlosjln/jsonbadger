import {describe, expect, test} from '@jest/globals';

import {build_nested_object, build_path_literal, split_dot_path} from '#src/utils/object-path.js';

describe('Object path utilities', function () {
	test('splits dot-separated paths into segments', function () {
		expect(split_dot_path('address.city')).toEqual(['address', 'city']);
	});

	test('rejects invalid path characters', function () {
		expect(() => split_dot_path('address.city-name')).toThrow('path has invalid characters');
	});

	test('builds a PostgreSQL path literal from segments', function () {
		expect(build_path_literal(['address', 'city'])).toBe('{address,city}');
	});

	test('builds a nested object tree from a dot path', function () {
		expect(build_nested_object('profile.country.code', 'US')).toEqual({
			profile: {
				country: {
					code: 'US'
				}
			}
		});
	});
});
