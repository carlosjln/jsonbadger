import {describe, expect, test} from '@jest/globals';

import {
	create_path_introspection,
	get_path_field_type,
	get_path_type,
	is_array_root
} from '#src/schema/path-introspection.js';
import field_definition_parser from '#src/schema/field-definition-parser.js';

describe('Schema path introspection lifecycle', function () {
	test('returns empty structures for null parsed schema and malformed field maps', function () {
		const introspection = create_path_introspection(null);

		expect(introspection.field_types).toEqual({});
		expect(introspection.object_paths instanceof Set).toBe(true);
		expect(introspection.object_paths.size).toBe(0);

		expect(get_path_field_type(null, 'name')).toBeNull();
		expect(get_path_field_type(introspection, '')).toBeNull();
		expect(get_path_field_type('bad-state', 'name')).toBeNull();
		expect(get_path_field_type({field_types: 123}, 'name')).toBeNull();
	});

	test('resolves field and object path types with fallback object-path behavior', function () {
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

	test('creates path introspection from parsed schema state', function () {
		const parsed_schema = field_definition_parser({
			profile: {
				city: String
			},
			tags: [String]
		});
		const introspection = create_path_introspection(parsed_schema);

		expect(get_path_field_type(introspection, 'profile.city').instance).toBe('String');
		expect(get_path_type(introspection, 'profile')).toBe('object');
		expect(is_array_root(introspection, 'tags.items')).toBe(true);
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
