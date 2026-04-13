import {describe, expect, test} from '@jest/globals';

import where_compiler from '#src/sql/read/where/index.js';
import {
	create_bound_schema
} from '#test/unit/query/test-helpers.js';

describe('where_compiler behavior', function () {
	describe('core query flow', function () {
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
	});

	describe('array-root behavior', function () {
		test('uses array containment shortcut for scalar comparisons on array-root fields', function () {
			const schema_instance = {
				is_array_root: function (path_value) {
					return path_value === 'tags';
				},
				get_path: function (path_value) {
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
	});

	describe('$elem_match behavior', function () {
		test('compiles $elem_match variants: regex, scalar, operator object and nested object', function () {
			const regex_result = where_compiler({tags: {$elem_match: /vip/i}});
			const scalar_result = where_compiler({scores: {$elem_match: 7}});
			const operator_result = where_compiler({scores: {$elem_match: {$gte: 10, $lte: 20, $options: 'i'}}});
			const nested_result = where_compiler({
				items: {
					$elem_match: {
						name: /hat/i,
						sku: {$regex: '^H', $options: 'i'},
						qty: {$gt: 1},
						status: 'active'
					}
				}
			});

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
			const result = where_compiler({
				scores: {
					$elem_match: {
						$eq: '7',
						$ne: '8',
						$lt: 10,
						$in: ['7', '9'],
						$nin: ['0']
					}
				}
			});

			expect(result.sql).toContain("elem #>> '{}' = $1");
			expect(result.sql).toContain("elem #>> '{}' != $2");
			expect(result.sql).toContain("(elem #>> '{}')::numeric < $3");
			expect(result.sql).toContain("elem #>> '{}' = ANY($4::text[])");
			expect(result.sql).toContain("NOT (elem #>> '{}' = ANY($5::text[]))");
			expect(result.params).toEqual(['7', '8', 10, ['7', '9'], ['0']]);
		});
	});

	describe('standard path operators', function () {
		test('preserves nullish query values and falls back array-contains casting when child caster is unavailable', function () {
			const null_result = where_compiler({age: {$eq: null}});
			const undefined_result = where_compiler({age: {$ne: undefined}});
			const fallback_array_result = where_compiler({tags: 'raw-tag'}, {
				schema: {
					is_array_root: function (path_value) {
						return path_value === 'tags';
					},
					get_path: function () {
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

		test('compiles scalar operators, regex, and casting fallbacks for standard paths', function () {
			const schema_instance = {
				is_array_root: function () {
					return false;
				},
				get_path: function (path_value) {
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
				}
			}, {schema: schema_instance});

			expect(result.sql).toContain(' = ANY(');
			expect(result.sql).toContain('NOT (');
			expect(result.sql).toContain('~*');
			expect(result.params).toContain('true');
			expect(result.params).toContainEqual(['true']);
		});

		test('compiles JSON containment, existence, and path-existence operators', function () {
			const schema_instance = create_bound_schema({}, {}, {
				supports_jsonpath: false
			});
			const result = where_compiler({
				payload: {
					$contains: {nested: true},
					$size: 2,
					$exists: true,
					$has_key: 'nested',
					$has_any_keys: ['nested', 'count'],
					$has_all_keys: ['nested', 'count']
				}
			}, {
				schema: schema_instance
			});

			expect(result.sql).toContain('@>');
			expect(result.sql).toContain('jsonb_array_length(');
			expect(result.sql).toContain(' IS NOT NULL');
			expect(result.sql).toContain(' ? ');
			expect(result.sql).toContain(' ?| ');
			expect(result.sql).toContain(' ?& ');
		});

		test('normalizes scalar array operators on standard paths', function () {
			const result = where_compiler({
				tag_ids: {
					$all: 'single'
				}
			}, {
				schema: {
					is_array_root: function () {
						return false;
					},
					get_path: function (path_value) {
						if(path_value === 'tag_ids') {
							return {
								instance: 'Array'
							};
						}

						return null;
					}
				}
			});

			expect(result.params).toContain('["single"]');
		});
	});

	describe('unsupported operator guards', function () {
		test('throws clear errors for unsupported operators in standard and $elem_match contexts', function () {
			expect(function unsupported_standard_operator() {
				where_compiler({age: {$unknown: 1}});
			}).toThrow('Unsupported operator: $unknown');

			expect(function unsupported_elem_match_operator() {
				where_compiler({tags: {$elem_match: {$unknown: 1}}});
			}).toThrow('Unsupported operator inside $elem_match: $unknown');
		});

		test('throws clear errors for unsupported nested-array and nested $elem_match operators', function () {
			expect(function unsupported_nested_array_operator() {
				where_compiler({
					'orders.total': {
						$unknown: 1
					}
				}, {
					schema: {
						is_array_root: function (path_value) {
							return path_value === 'orders';
						}
					}
				});
			}).toThrow('Unsupported operator inside $elem_match: $unknown');

			expect(function unsupported_nested_elem_match_operator() {
				where_compiler({
					items: {
						$elem_match: {
							sku: {
								$unknown: 1
							}
						}
					}
				});
			}).toThrow('Unsupported operator inside $elem_match: $unknown');
		});
	});

	describe('base-field behavior', function () {
		test('routes base fields to table columns and validates allowed operators', function () {
			const base_field_result = where_compiler({
				id: {$in: ['1', '2']},
				created_at: {$gte: '2026-02-27T00:00:00.000Z'},
				updated_at: {$lt: new Date('2026-02-28T00:00:00.000Z')}
			});

			expect(base_field_result.sql).toContain('"id" = ANY($1::bigint[])');
			expect(base_field_result.sql).toContain('"created_at" >= $2::timestamptz');
			expect(base_field_result.sql).toContain('"updated_at" < $3::timestamptz');
			expect(base_field_result.params).toEqual([
				['1', '2'],
				'2026-02-27T00:00:00.000Z',
				'2026-02-28T00:00:00.000Z'
			]);
		});

		test('rejects dotted base-field paths and unsupported base-field operators', function () {
			expect(function compile_dotted_base_field_path() {
				where_compiler({'created_at.value': {$eq: '2026-02-27T00:00:00.000Z'}});
			}).toThrow('Base fields only support top-level paths');

			expect(function compile_base_field_regex_operator() {
				where_compiler({id: {$regex: '^1'}});
			}).toThrow('Operator is not supported for base field');

			expect(function compile_base_field_json_operator() {
				where_compiler({created_at: {$exists: true}});
			}).toThrow('Operator is not supported for base field');
		});

		test('rejects unsupported base-field comparison shapes', function () {
			expect(function compile_base_field_regexp() {
				where_compiler({created_at: /2026/});
			}).toThrow('Base field does not support regular expression matching');

			expect(function compile_base_field_elem_match() {
				where_compiler({updated_at: {$elem_match: {$eq: '2026-02-27T00:00:00.000Z'}}});
			}).toThrow('Base field does not support $elem_match');

			expect(function compile_base_field_plain_object() {
				where_compiler({created_at: {iso: '2026-02-27T00:00:00.000Z'}});
			}).toThrow('Base field only supports scalar values or operator objects');

			expect(function compile_base_field_options() {
				where_compiler({created_at: {$eq: '2026-02-27T00:00:00.000Z', $options: 'i'}});
			}).toThrow('Base field does not support $options');
		});

		test('compiles base-field eq ne and nin branches for bigint ids', function () {
			const bigint_id = BigInt(7);
			const result = where_compiler({
				id: {
					$eq: bigint_id,
					$ne: 8,
					$nin: [9n, 10]
				}
			});

			expect(result.sql).toContain('"id" = $1::bigint');
			expect(result.sql).toContain('"id" != $2::bigint');
			expect(result.sql).toContain('NOT ("id" = ANY($3::bigint[]))');
			expect(result.params).toEqual([
				'7',
				'8',
				['9', '10']
			]);
		});

		test('compiles base-field eq ne in and nin branches for timestamps', function () {
			const result = where_compiler({
				created_at: {
					$eq: '2026-02-27T00:00:00.000Z',
					$ne: new Date('2026-02-28T00:00:00.000Z'),
					$in: '2026-03-01T00:00:00.000Z',
					$nin: ['2026-03-02T00:00:00.000Z']
				}
			});

			expect(result.sql).toContain('"created_at" = $1::timestamptz');
			expect(result.sql).toContain('"created_at" != $2::timestamptz');
			expect(result.sql).toContain('"created_at" = ANY($3::timestamptz[])');
			expect(result.sql).toContain('NOT ("created_at" = ANY($4::timestamptz[]))');
			expect(result.params).toEqual([
				'2026-02-27T00:00:00.000Z',
				'2026-02-28T00:00:00.000Z',
				['2026-03-01T00:00:00.000Z'],
				['2026-03-02T00:00:00.000Z']
			]);
		});

		test('rejects invalid base-field scalar and timestamp values', function () {
			expect(function compile_base_field_null_value() {
				where_compiler({created_at: {$eq: null}});
			}).toThrow('Invalid value for base field');

			expect(function compile_base_field_array_value() {
				where_compiler({updated_at: {$eq: ['2026-02-27T00:00:00.000Z']}});
			}).toThrow('Invalid value for base field');

			expect(function compile_base_field_plain_object_value() {
				where_compiler({created_at: {$eq: {iso: '2026-02-27T00:00:00.000Z'}}});
			}).toThrow('Invalid value for base field');

			expect(function compile_base_field_invalid_timestamp() {
				where_compiler({updated_at: {$lte: 'not-a-timestamp'}});
			}).toThrow('Invalid timestamp value for base field');
		});

		test('rejects invalid numeric ids and accepts integer numbers for bigserial ids', function () {
			const valid_result = where_compiler({
				id: {
					$eq: 11,
					$in: [12, 13]
				}
			});

			expect(valid_result.sql).toContain('"id" = $1::bigint');
			expect(valid_result.sql).toContain('"id" = ANY($2::bigint[])');
			expect(valid_result.params).toEqual(['11', ['12', '13']]);

			expect(function compile_invalid_decimal_id() {
				where_compiler({id: {$eq: 1.25}});
			}).toThrow('Invalid id value for bigint identity');

			expect(function() {
				where_compiler({id: {$eq: Number.MAX_SAFE_INTEGER + 1}});
			}).toThrow('Invalid id value for bigint identity');
		});

		test('accepts native bigint input for bigint-backed id filters', function () {
			const result = where_compiler({
				id: {
					$eq: 7n,
					$in: [8n, 9n]
				}
			});

			expect(result.sql).toContain('"id" = $1::bigint');
			expect(result.sql).toContain('"id" = ANY($2::bigint[])');
			expect(result.params).toEqual(['7', ['8', '9']]);
		});

		test('uses uuid parameter casts for id filters when the bound identity is uuidv7', function () {
			const schema_instance = create_bound_schema({}, {
				identity: {
					type: 'uuid',
					format: 'uuidv7',
					mode: 'database'
				}
			});
			const base_field_result = where_compiler({
				id: {$eq: '0194f028-579a-7b5b-8107-b9ad31395f43'}
			}, {
				schema: schema_instance
			});

			expect(base_field_result.sql).toContain('"id" = $1::uuid');
			expect(base_field_result.params).toEqual(['0194f028-579a-7b5b-8107-b9ad31395f43']);
		});

		test('compiles uuidv7 id array comparisons for base fields', function () {
			const schema_instance = create_bound_schema({}, {
				identity: {
					type: 'uuid',
					format: 'uuidv7',
					mode: 'database'
				}
			});
			const result = where_compiler({
				id: {
					$in: ['0194f028-579a-7b5b-8107-b9ad31395f43'],
					$nin: ['0194f028-579b-7c8c-9108-caeb424a6a54']
				}
			}, {
				schema: schema_instance
			});

			expect(result.sql).toContain('"id" = ANY($1::uuid[])');
			expect(result.sql).toContain('NOT ("id" = ANY($2::uuid[]))');
			expect(result.params).toEqual([
				['0194f028-579a-7b5b-8107-b9ad31395f43'],
				['0194f028-579b-7c8c-9108-caeb424a6a54']
			]);
		});

		test('compiles timestamp greater-than and less-than-or-equal comparisons for base fields', function () {
			const result = where_compiler({
				created_at: {
					$gt: '2026-02-27T00:00:00.000Z'
				},
				updated_at: {
					$lte: '2026-02-28T00:00:00.000Z'
				}
			});

			expect(result.sql).toContain('"created_at" > $1::timestamptz');
			expect(result.sql).toContain('"updated_at" <= $2::timestamptz');
			expect(result.params).toEqual([
				'2026-02-27T00:00:00.000Z',
				'2026-02-28T00:00:00.000Z'
			]);
		});

		test('rejects invalid id values for the selected identity shape', function () {
			const schema_instance = create_bound_schema({}, {
				identity: {
					type: 'uuid',
					format: 'uuidv7',
					mode: 'database'
				}
			});

			expect(function compile_invalid_bigserial_id() {
				where_compiler({id: {$eq: 'abc'}});
			}).toThrow('Invalid id value for bigint identity');

			expect(function compile_invalid_uuid_id() {
				where_compiler({id: {$eq: 'abc'}}, {schema: schema_instance});
			}).toThrow('Invalid id value for uuidv7 identity');
		});
	});
});
