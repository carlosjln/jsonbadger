import {describe, expect, test} from '@jest/globals';

import where_compiler from '#src/sql/read/where/index.js';
import Schema from '#src/schema/schema.js';
import {
	create_bound_schema
} from '#test/unit/query/test-helpers.js';

describe('where_compiler field type casting', function () {
	test('casts scalar and operator values using schema field types', function () {
		const schema_instance = new Schema({
			active: Boolean,
			tags: [Number]
		});

		const eq_result = where_compiler({active: 'yes'}, {
			schema: schema_instance,
			data_column: 'data'
		});
		const in_result = where_compiler({active: {$in: ['yes', 'no']}}, {
			schema: schema_instance,
			data_column: 'data'
		});
		const all_result = where_compiler({tags: {$all: ['1', '2']}}, {
			schema: schema_instance,
			data_column: 'data'
		});

		expect(eq_result.params).toEqual(['true']);
		expect(in_result.params).toEqual([['true', 'false']]);
		expect(all_result.params).toEqual(['[1,2]']);
	});

	test('maps key and path existence operators to PostgreSQL SQL', function () {
		const schema_instance = create_bound_schema({}, {}, {
			supports_jsonpath: false
		});
		const has_key_result = where_compiler({profile: {$has_key: 'city'}}, {
			data_column: 'data'
		});
		const has_any_result = where_compiler({profile: {$has_any_keys: ['city', 'country']}}, {
			data_column: 'data'
		});
		const has_all_result = where_compiler({profile: {$has_all_keys: ['city', 'country']}}, {
			data_column: 'data'
		});
		const exists_result = where_compiler({profile: {$exists: true}}, {
			schema: schema_instance,
			data_column: 'data'
		});
		const missing_result = where_compiler({profile: {$exists: false}}, {
			schema: schema_instance,
			data_column: 'data'
		});

		expect(has_key_result.sql).toContain(' ? $1');
		expect(has_key_result.params).toEqual(['city']);

		expect(has_any_result.sql).toContain(' ?| $1::text[]');
		expect(has_any_result.params).toEqual([['city', 'country']]);

		expect(has_all_result.sql).toContain(' ?& $1::text[]');
		expect(has_all_result.params).toEqual([['city', 'country']]);

		expect(exists_result.sql).toContain(' IS NOT NULL');
		expect(exists_result.params).toEqual([]);

		expect(missing_result.sql).toContain(' IS NULL');
		expect(missing_result.params).toEqual([]);
	});
});
