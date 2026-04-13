import {describe, expect, test} from '@jest/globals';

import where_compiler from '#src/sql/read/where/index.js';
import {
	create_bound_schema
} from '#test/unit/query/test-helpers.js';

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

		expect(nested_scope_result.sql).toContain("#> '{\"profile\",\"city\"}' ? $1");
		expect(nested_scope_result.params).toEqual(['zip']);

		expect(literal_key_result.sql).toContain("#> '{\"profile\",\"city\"}' ? $1");
		expect(literal_key_result.params).toEqual(['address.zip']);
	});

	test('maps path existence to native JSONPath when server support is available', function () {
		const native_schema_instance = create_bound_schema();
		const exists_result = where_compiler({profile: {$exists: true}}, {
			schema: native_schema_instance,
			data_column: 'data'
		});
		const missing_result = where_compiler({profile: {$exists: false}}, {
			schema: native_schema_instance,
			data_column: 'data'
		});

		expect(exists_result.sql).toContain(' @? $1::jsonpath');
		expect(exists_result.params).toEqual(['$.profile']);

		expect(missing_result.sql).toContain('NOT ("data" @? $1::jsonpath)');
		expect(missing_result.params).toEqual(['$.profile']);
	});

	test('maps path existence to extracted-value SQL checks when server jsonpath support is unavailable', function () {
		const compat_schema_instance = create_bound_schema({}, {}, {
			supports_jsonpath: false
		});
		const exists_result = where_compiler({profile: {$exists: true}}, {
			schema: compat_schema_instance,
			data_column: 'data'
		});
		const missing_result = where_compiler({profile: {$exists: false}}, {
			schema: compat_schema_instance,
			data_column: 'data'
		});

		expect(exists_result.sql).toContain(' IS NOT NULL');
		expect(exists_result.params).toEqual([]);

		expect(missing_result.sql).toContain(' IS NULL');
		expect(missing_result.params).toEqual([]);
	});

	test('rejects invalid $exists operator values before SQL execution', function () {
		const schema_instance = create_bound_schema();

		expect(function compile_invalid_exists() {
			where_compiler({profile: {$exists: 'yes'}}, {
				schema: schema_instance,
				data_column: 'data'
			});
		}).toThrow('Invalid value for $exists operator');
	});

	test('fails fast when path-existence dispatch has no bound schema runtime', function () {
		expect(function compile_unbound_exists() {
			where_compiler({profile: {$exists: true}}, {
				data_column: 'data'
			});
		}).toThrow('Read operator requires a bound schema runtime: $exists');
	});
});
