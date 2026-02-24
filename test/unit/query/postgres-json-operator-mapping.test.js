import {describe, expect, test} from '@jest/globals';

import where_compiler from '#src/query/where-compiler.js';

describe('PostgreSQL JSON operator mapping', function () {
	test('maps containment and existence operators to native JSONB operators', function () {
		const contains_result = where_compiler({profile: {$contains: {city: 'Bogota'}}}, {
			data_column: 'data'
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

		expect(contains_result.sql).toContain(' @> $1::jsonb');
		expect(contains_result.params).toEqual(['{"profile":{"city":"Bogota"}}']);

		expect(has_key_result.sql).toContain(' -> ');
		expect(has_key_result.sql).toContain(' ? $1');
		expect(has_key_result.params).toEqual(['city']);

		expect(has_any_result.sql).toContain(' ?| $1::text[]');
		expect(has_any_result.params).toEqual([['city', 'country']]);

		expect(has_all_result.sql).toContain(' ?& $1::text[]');
		expect(has_all_result.params).toEqual([['city', 'country']]);
	});

	test('preserves PostgreSQL top-level semantics for existence operators', function () {
		const nested_scope_result = where_compiler({'profile.city': {$has_key: 'zip'}}, {
			data_column: 'data'
		});
		const literal_key_result = where_compiler({'profile.city': {$has_key: 'address.zip'}}, {
			data_column: 'data'
		});

		expect(nested_scope_result.sql).toContain("#> '{profile,city}' ? $1");
		expect(nested_scope_result.params).toEqual(['zip']);

		expect(literal_key_result.sql).toContain("#> '{profile,city}' ? $1");
		expect(literal_key_result.params).toEqual(['address.zip']);
	});

	test('maps JSONPath operators to native PostgreSQL jsonpath operators', function () {
		const exists_result = where_compiler({profile: {$json_path_exists: '$.city ? (@ != null)'}}, {
			data_column: 'data'
		});
		const match_result = where_compiler({profile: {$json_path_match: '$.age > 18'}}, {
			data_column: 'data'
		});

		expect(exists_result.sql).toContain(' @? $1::jsonpath');
		expect(exists_result.params).toEqual(['$.city ? (@ != null)']);

		expect(match_result.sql).toContain(' @@ $1::jsonpath');
		expect(match_result.params).toEqual(['$.age > 18']);
	});

	test('rejects invalid JSONPath operator values before SQL execution', function () {
		expect(function compile_invalid_jsonpath_exists() {
			where_compiler({profile: {$json_path_exists: ''}}, {data_column: 'data'});
		}).toThrow('Invalid value for $json_path_exists operator');

		expect(function compile_invalid_jsonpath_match() {
			where_compiler({profile: {$json_path_match: null}}, {data_column: 'data'});
		}).toThrow('Invalid value for $json_path_match operator');
	});
});

