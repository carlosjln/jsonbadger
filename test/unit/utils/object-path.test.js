import {describe, expect, test} from '@jest/globals';

import {build_nested_object, build_path_literal, expand_dot_paths, split_dot_path} from '#src/utils/object-path.js';

describe('Object path utilities', function () {
	test('splits dot-separated paths into segments', function () {
		expect(split_dot_path('address.city')).toEqual(['address', 'city']);
	});

	test('rejects invalid path characters', function () {
		expect(() => split_dot_path('address.city-name')).toThrow('path has invalid characters');
	});

	test('rejects restricted prototype-pollution path segments', function () {
		expect(() => split_dot_path('__proto__.admin')).toThrow('Invalid path: restricted key name "__proto__"');
		expect(() => split_dot_path('constructor.payload')).toThrow('Invalid path: restricted key name "constructor"');
		expect(() => split_dot_path('profile.prototype.flag')).toThrow('Invalid path: restricted key name "prototype"');
	});

	test('builds a PostgreSQL path literal from segments', function () {
		expect(build_path_literal(['address', 'city'])).toBe('{"address","city"}');
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

	test('expands dotted keys into nested objects without dropping sibling state', function () {
		expect(expand_dot_paths({
			'profile.city': 'Miami',
			profile: {
				country: 'US'
			},
			settings: {
				'theme.mode': 'dark'
			}
		})).toEqual({
			profile: {
				city: 'Miami',
				country: 'US'
			},
			settings: {
				theme: {
					mode: 'dark'
				}
			}
		});
	});

	test('deep-merges overlapping dotted and plain object branches', function () {
		expect(expand_dot_paths({
			'profile.settings': {
				theme: {
					mode: 'dark'
				},
				alerts: {
					email: true
				}
			},
			profile: {
				settings: {
					theme: {
						contrast: 'high'
					},
					alerts: {
						sms: false
					}
				}
			}
		})).toEqual({
			profile: {
				settings: {
					theme: {
						mode: 'dark',
						contrast: 'high'
					},
					alerts: {
						email: true,
						sms: false
					}
				}
			}
		});
	});

	test('deep-merges repeated dotted branches that target the same plain-object leaf', function () {
		expect(expand_dot_paths({
			'profile.settings.theme': 'dark',
			'profile.settings': {
				alerts: {
					email: true
				}
			}
		})).toEqual({
			profile: {
				settings: {
					theme: 'dark',
					alerts: {
						email: true
					}
				}
			}
		});
	});

	test('expands dotted paths recursively inside arrays and preserves non-plain values', function () {
		expect(expand_dot_paths([
			{
				'profile.city': 'Miami'
			},
			{
				settings: {
					'theme.mode': 'dark'
				}
			},
			'already-plain'
		])).toEqual([
			{
				profile: {
					city: 'Miami'
				}
			},
			{
				settings: {
					theme: {
						mode: 'dark'
					}
				}
			},
			'already-plain'
		]);
	});

	test('rejects restricted dotted keys during nested object building and expansion', function () {
		expect(() => build_nested_object('__proto__.polluted', true)).toThrow('Invalid path: restricted key name "__proto__"');
		expect(() => expand_dot_paths({
			'constructor.admin': true
		})).toThrow('Invalid path: restricted key name "constructor"');
	});
});
