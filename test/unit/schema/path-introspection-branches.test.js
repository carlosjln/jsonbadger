import {describe, expect, test} from '@jest/globals';

import {
	create_path_introspection,
	get_path_field_type,
	get_path_type,
	is_array_root
} from '#src/schema/path-introspection.js';

describe('path-introspection branch behavior', function () {
	test('returns empty structures for null parsed schema and malformed maps', function () {
		const introspection = create_path_introspection(null);

		expect(introspection.field_types).toEqual({});
		expect(introspection.object_paths instanceof Set).toBe(true);
		expect(introspection.object_paths.size).toBe(0);
		
		expect(get_path_field_type(null, 'name')).toBeNull();
		expect(get_path_field_type(introspection, '')).toBeNull();
		expect(get_path_field_type('bad-state', 'name')).toBeNull();
		expect(get_path_field_type({field_types: 123}, 'name')).toBeNull();
	});

	test('resolves field and object path types with fallback object_paths behavior', function () {
		const field_type_ref = {instance: 'String'};
		const malformed_object_paths_state = {
			field_types: {name: field_type_ref},
			object_paths: ['profile']
		};
		const object_path_state = {
			field_types: Object.create(null),
			object_paths: new Set(['profile'])
		};

		expect(get_path_type(malformed_object_paths_state, 'name')).toBe('String');
		expect(get_path_type(malformed_object_paths_state, 'profile')).toBeNull();
		expect(get_path_type(object_path_state, 'profile')).toBe('object');
		expect(get_path_type(null, 'profile')).toBeNull();
	});

	test('is_array_root handles invalid state, missing roots, and array roots', function () {
		const introspection = {
			field_types: {
				tags: {instance: 'Array'},
				name: {instance: 'String'}
			},
			object_paths: new Set()
		};

		expect(is_array_root(null, 'tags')).toBe(false);
		expect(is_array_root(introspection, '')).toBe(false);
		expect(is_array_root(introspection, 'missing.child')).toBe(false);
		expect(is_array_root(introspection, 'name.child')).toBe(false);
		expect(is_array_root(introspection, 'tags')).toBe(true);
		expect(is_array_root(introspection, 'tags.items')).toBe(true);
	});
});
