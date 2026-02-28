import {describe, expect, test} from '@jest/globals';

import where_compiler from '#src/query/where-compiler.js';

describe('where_compiler branch coverage', function () {
	test('returns TRUE and preserves start index for empty filters', function () {
		const result = where_compiler(null, null, 5);

		expect(result).toEqual({
			sql: 'TRUE',
			params: [],
			next_index: 5
		});
	});

	test('supports top-level RegExp and plain nested-object containment', function () {
		const regex_result = where_compiler({user_name: /Jo/i});
		const contains_result = where_compiler({profile: {city: 'San Juan'}});

		expect(regex_result.sql).toContain("\"data\" ->> 'user_name' ~*");
		expect(regex_result.params).toEqual(['Jo']);

		expect(contains_result.sql).toContain('"data" @> $1::jsonb');
		expect(contains_result.params).toEqual(['{"profile":{"city":"San Juan"}}']);
	});

	test('uses array containment shortcut for scalar comparisons on array-root fields', function () {
		const schema_instance = {
			is_array_root: function (path_value) {
				return path_value === 'tags';
			},
			path: function (path_value) {
				if(path_value !== 'tags') {
					return null;
				}

				return {
					instance: 'Array',
					of_field_type: {
						cast: function (value) {
							return Number(value);
						}
					}
				};
			}
		};
		const result = where_compiler({tags: '2'}, {schema: schema_instance});

		expect(result.sql).toContain('"data" @> $1::jsonb');
		expect(result.params).toEqual(['{"tags":[2]}']);
	});

	test('compiles nested-array root operators through jsonb_array_elements', function () {
		const schema_instance = {
			is_array_root: function (path_value) {
				return path_value === 'orders';
			}
		};
		const result = where_compiler({'orders.total': {$gt: 10, $regex: '^1', $options: 'i'}}, {schema: schema_instance});

		expect(result.sql).toContain('jsonb_array_elements("data" -> \'orders\')');
		expect(result.sql).toContain("elem->>'total'");
		expect(result.sql).toContain('::numeric > $1');
		expect(result.sql).toContain('~* $2');
		expect(result.params).toEqual([10, '^1']);
	});

	test('compiles $elem_match variants: regex, scalar, operator object and nested object', function () {
		const regex_result = where_compiler({tags: {$elem_match: /vip/i}});
		const scalar_result = where_compiler({scores: {$elem_match: 7}});
		const operator_result = where_compiler({scores: {$elem_match: {$gte: 10, $lte: 20, $options: 'i'}}});
		const nested_result = where_compiler({items: {$elem_match: {
			name: /hat/i,
			sku: {$regex: '^H', $options: 'i'},
			qty: {$gt: 1},
			status: 'active'
		}}});

		expect(regex_result.sql).toContain('jsonb_array_elements("data" -> \'tags\')');
		expect(regex_result.sql).toContain("elem #>> '{}' ~*");
		expect(regex_result.params).toEqual(['vip']);

		expect(scalar_result.sql).toContain("elem #>> '{}' = $1");
		expect(scalar_result.params).toEqual(['7']);

		expect(operator_result.sql).toContain("(elem #>> '{}')::numeric >= $1");
		expect(operator_result.sql).toContain("(elem #>> '{}')::numeric <= $2");
		expect(operator_result.params).toEqual([10, 20]);

		expect(nested_result.sql).toContain("elem->>'name' ~*");
		expect(nested_result.sql).toContain("elem->>'sku' ~* $2");
		expect(nested_result.sql).toContain("(elem->>'qty')::numeric > $3");
		expect(nested_result.sql).toContain("elem->>'status' = $4");
		expect(nested_result.params).toEqual(['hat', '^H', 1, 'active']);
	});

	test('compiles $elem_match scalar operators for eq/ne/lt/in/nin', function () {
		const result = where_compiler({scores: {$elem_match: {
			$eq: '7',
			$ne: '8',
			$lt: 10,
			$in: ['7', '9'],
			$nin: ['0']
		}}});

		expect(result.sql).toContain("elem #>> '{}' = $1");
		expect(result.sql).toContain("elem #>> '{}' != $2");
		expect(result.sql).toContain("(elem #>> '{}')::numeric < $3");
		expect(result.sql).toContain("elem #>> '{}' = ANY($4::text[])");
		expect(result.sql).toContain("NOT (elem #>> '{}' = ANY($5::text[]))");
		expect(result.params).toEqual(['7', '8', 10, ['7', '9'], ['0']]);
	});

	test('preserves nullish query values and falls back array-contains casting when child caster is unavailable', function () {
		const null_result = where_compiler({age: {$eq: null}});
		const undefined_result = where_compiler({age: {$ne: undefined}});
		const fallback_array_result = where_compiler({tags: 'raw-tag'}, {
			schema: {
				is_array_root: function (path_value) {
					return path_value === 'tags';
				},
				path: function () {
					return {
						instance: 'Array'
					};
				}
			}
		});

		expect(null_result.params).toEqual(['null']);
		expect(undefined_result.params).toEqual(['undefined']);
		expect(fallback_array_result.sql).toContain('"data" @> $1::jsonb');
		expect(fallback_array_result.params).toEqual(['{"tags":["raw-tag"]}']);
	});

	test('covers standard operators, casting fallbacks and scalar-array operator normalization', function () {
		const schema_instance = {
			is_array_root: function () {
				return false;
			},
			path: function (path_value) {
				if(path_value === 'flags') {
					return {
						cast: function (value) {
							return value === 'yes' ? true : value;
						}
					};
				}

				if(path_value === 'tag_ids') {
					return {
						instance: 'Array'
					};
				}

				return null;
			}
		};
		const result = where_compiler({
			flags: {
				$eq: 'yes',
				$ne: 'no',
				$gt: '1',
				$gte: '1',
				$lt: '9',
				$lte: '9',
				$in: 'yes',
				$nin: ['no', 'maybe'],
				$regex: '^t',
				$options: 'i'
			},
			payload: {
				$contains: {nested: true},
				$size: 2,
				$json_path_exists: '$.nested ? (@ == true)',
				$json_path_match: '$.count > 1',
				$has_key: 'nested',
				$has_any_keys: ['nested', 'count'],
				$has_all_keys: ['nested', 'count']
			},
			tag_ids: {
				$all: 'single'
			}
		}, {schema: schema_instance});

		expect(result.sql).toContain(' = ANY(');
		expect(result.sql).toContain('NOT (');
		expect(result.sql).toContain('~*');
		expect(result.sql).toContain('@>');
		expect(result.sql).toContain('jsonb_array_length(');
		expect(result.sql).toContain(' @? ');
		expect(result.sql).toContain(' @@ ');
		expect(result.sql).toContain(' ? ');
		expect(result.sql).toContain(' ?| ');
		expect(result.sql).toContain(' ?& ');
		expect(result.params).toContain('true');
		expect(result.params).toContainEqual(['true']);
		expect(result.params).toContain('["single"]');
	});

	test('throws clear errors for unsupported operators in standard and $elem_match contexts', function () {
		expect(function unsupported_standard_operator() {
			where_compiler({age: {$unknown: 1}});
		}).toThrow('Unsupported operator: $unknown');

		expect(function unsupported_elem_match_operator() {
			where_compiler({tags: {$elem_match: {$unknown: 1}}});
		}).toThrow('Unsupported operator inside $elem_match: $unknown');
	});

	test('routes reserved metadata fields to table columns and validates allowed operators', function () {
		const metadata_result = where_compiler({
			id: {$in: ['1', '2']},
			created_at: {$gte: '2026-02-27T00:00:00.000Z'},
			updated_at: {$lt: new Date('2026-02-28T00:00:00.000Z')}
		});

		expect(metadata_result.sql).toContain('"id" = ANY($1::bigint[])');
		expect(metadata_result.sql).toContain('"created_at" >= $2::timestamptz');
		expect(metadata_result.sql).toContain('"updated_at" < $3::timestamptz');
		expect(metadata_result.params).toEqual([
			['1', '2'],
			'2026-02-27T00:00:00.000Z',
			'2026-02-28T00:00:00.000Z'
		]);
	});

	test('rejects dotted reserved paths and unsupported reserved-field operators', function () {
		expect(function compile_dotted_reserved_path() {
			where_compiler({'created_at.value': {$eq: '2026-02-27T00:00:00.000Z'}});
		}).toThrow('Reserved metadata fields only support top-level paths');

		expect(function compile_reserved_regex_operator() {
			where_compiler({id: {$regex: '^1'}});
		}).toThrow('Operator is not supported for reserved metadata field');

		expect(function compile_reserved_json_operator() {
			where_compiler({created_at: {$json_path_exists: '$.x'}});
		}).toThrow('Operator is not supported for reserved metadata field');
	});

	test('uses uuid parameter casts for id filters when id_strategy is uuidv7', function () {
		const metadata_result = where_compiler({
			id: {$eq: '0194f028-579a-7b5b-8107-b9ad31395f43'}
		}, {
			id_strategy: 'uuidv7'
		});

		expect(metadata_result.sql).toContain('"id" = $1::uuid');
		expect(metadata_result.params).toEqual(['0194f028-579a-7b5b-8107-b9ad31395f43']);
	});

	test('rejects invalid id values for selected id_strategy', function () {
		expect(function compile_invalid_bigserial_id() {
			where_compiler({id: {$eq: 'abc'}});
		}).toThrow('Invalid id value for bigserial id_strategy');

		expect(function compile_invalid_uuid_id() {
			where_compiler({id: {$eq: 'abc'}}, {id_strategy: 'uuidv7'});
		}).toThrow('Invalid id value for uuid id_strategy');
	});
});
