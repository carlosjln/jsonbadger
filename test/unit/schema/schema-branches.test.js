import {describe, expect, test} from '@jest/globals';

import defaults from '#src/constants/defaults.js';
import Schema from '#src/schema/schema.js';

describe('Schema guard and explicit-array index behavior', function () {
	test('uses default schema_def and schema options when omitted', function () {
		const schema_instance = new Schema();

		expect(schema_instance.schema_def).toEqual({});
		expect(schema_instance.options).toEqual(defaults.schema_options);
		expect(schema_instance.get_indexes()).toEqual([]);

		expect(schema_instance.schema_description).toEqual({
			paths: [],
			objects: []
		});
	});

	test('returns safe defaults when compiled_schema helper methods are unavailable', function () {
		const schema_instance = new Schema({name: String});

		schema_instance.compiled_schema = {};

		expect(schema_instance.path('name')).toBeNull();
		expect(schema_instance.get_path_type('name')).toBeNull();
		expect(schema_instance.is_array_root('tags')).toBe(false);
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
				index_spec: 'tags',
				index_options: {}
			}
		]);
	});
});
