import {describe, expect, test} from '@jest/globals';

import defaults from '#src/constants/defaults.js';
import Schema from '#src/schema/schema.js';

describe('Schema guard and explicit-array index behavior', function () {
	test('uses default schema options when omitted', function () {
		const schema_instance = new Schema();

		expect(schema_instance.options).toEqual(defaults.schema_options);
		expect(schema_instance.get_indexes()).toEqual([]);
		expect(Object.keys(schema_instance.paths)).toEqual(
			expect.arrayContaining(['id', 'created_at', 'updated_at'])
		);
	});

	test('returns path descriptors through public runtime helpers', function () {
		const schema_instance = new Schema({name: String});

		expect(schema_instance.get_path('name').instance).toBe('String');
		expect(schema_instance.get_path('id').instance).toBe('Mixed');
		expect(schema_instance.get_path_type('name')).toBe('String');
		expect(schema_instance.is_array_root('tags')).toBe(false);
	});

	test('preserves user-declared base-field path definitions and still exposes base fields', function () {
		const schema_instance = new Schema({
			id: Number,
			created_at: String,
			name: String
		});

		expect(schema_instance.get_path('id').instance).toBe('Number');
		expect(schema_instance.get_path('created_at').instance).toBe('String');
		expect(schema_instance.get_path('updated_at').instance).toBe('Date');
		expect(Object.keys(schema_instance.paths)).toEqual(
			expect.arrayContaining(['id', 'created_at', 'updated_at', 'name'])
		);
	});

	test('auto-registers path-level index on explicit array type syntax', function () {
		const schema_instance = new Schema({
			tags: {
				type: [String],
				index: true
			}
		});

		expect(schema_instance.get_indexes()).toEqual([
			{
				using: 'gin',
				path: 'tags'
			}
		]);
	});
});
