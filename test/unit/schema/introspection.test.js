import {describe, expect, test} from '@jest/globals';

import Schema from '#src/schema/schema.js';

describe('Schema path introspection', function () {
	test('returns path metadata and supports get_path_type and is_array_root', function () {
		const schema_instance = new Schema({
			name: {
				type: String,
				match: /^[a-z]+$/,
				enum: ['alice', 'bob'],
				required: true
			},
			tags: [String],
			profile: {
				city: String
			}
		});

		const name_path = schema_instance.path('name');

		expect(name_path.path).toBe('name');
		expect(name_path.instance).toBe('String');
		expect(Array.isArray(name_path.validators)).toBe(true);
		expect(name_path.regExp).toEqual(/^[a-z]+$/);
		expect(name_path.enum_values).toEqual(['alice', 'bob']);

		expect(schema_instance.path('profile.city').instance).toBe('String');
		expect(schema_instance.path('unknown')).toBe(null);

		expect(schema_instance.get_path_type('name')).toBe('String');
		expect(schema_instance.get_path_type('tags')).toBe('Array');
		expect(schema_instance.get_path_type('profile')).toBe('object');
		expect(schema_instance.get_path_type('profile.city')).toBe('String');
		expect(schema_instance.get_path_type('missing')).toBe(null);

		expect(schema_instance.is_array_root('tags')).toBe(true);
		expect(schema_instance.is_array_root('tags.item')).toBe(true);
		expect(schema_instance.is_array_root('name')).toBe(false);
	});
});
