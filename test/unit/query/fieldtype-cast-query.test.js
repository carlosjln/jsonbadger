import {describe, expect, test} from '@jest/globals';

import where_compiler from '#src/query/where-compiler.js';
import Schema from '#src/schema/schema.js';

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

	test('maps key existence and JSONPath operators to PostgreSQL-native SQL', function () {
		const has_key_result = where_compiler({profile: {$has_key: 'city'}}, {
			data_column: 'data'
		});
		const has_any_result = where_compiler({profile: {$has_any_keys: ['city', 'country']}}, {
			data_column: 'data'
		});
		const has_all_result = where_compiler({profile: {$has_all_keys: ['city', 'country']}}, {
			data_column: 'data'
		});
		const jsonpath_exists_result = where_compiler({profile: {$json_path_exists: '$.city ? (@ != null)'}}, {
			data_column: 'data'
		});
		const jsonpath_match_result = where_compiler({profile: {$json_path_match: '$.age > 18'}}, {
			data_column: 'data'
		});

		expect(has_key_result.sql).toContain(' ? $1');
		expect(has_key_result.params).toEqual(['city']);

		expect(has_any_result.sql).toContain(' ?| $1::text[]');
		expect(has_any_result.params).toEqual([['city', 'country']]);

		expect(has_all_result.sql).toContain(' ?& $1::text[]');
		expect(has_all_result.params).toEqual([['city', 'country']]);

		expect(jsonpath_exists_result.sql).toContain(' @? $1::jsonpath');
		expect(jsonpath_exists_result.params).toEqual(['$.city ? (@ != null)']);

		expect(jsonpath_match_result.sql).toContain(' @@ $1::jsonpath');
		expect(jsonpath_match_result.params).toEqual(['$.age > 18']);
	});
});

