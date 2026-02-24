import {describe, expect, test} from '@jest/globals';

import all_operator from '#src/query/operators/all.js';
import contains_operator from '#src/query/operators/contains.js';
import gt_operator from '#src/query/operators/gt.js';
import gte_operator from '#src/query/operators/gte.js';
import lt_operator from '#src/query/operators/lt.js';
import lte_operator from '#src/query/operators/lte.js';
import has_all_keys_operator from '#src/query/operators/has-all-keys.js';
import has_any_keys_operator from '#src/query/operators/has-any-keys.js';
import has_key_operator from '#src/query/operators/has-key.js';
import in_operator from '#src/query/operators/in.js';
import jsonpath_exists_operator from '#src/query/operators/jsonpath-exists.js';
import jsonpath_match_operator from '#src/query/operators/jsonpath-match.js';
import nin_operator from '#src/query/operators/nin.js';
import size_operator from '#src/query/operators/size.js';
import {create_parameter_state} from '#src/sql/parameter-binder.js';

describe('Query operators', function () {
	test('converts a scalar into a text array parameter for $in', function () {
		const parameter_state = create_parameter_state();
		const sql_fragment = in_operator("data->>'age'", 42, parameter_state);

		expect(sql_fragment).toBe("data->>'age' = ANY($1::text[])");
		expect(parameter_state.params).toEqual([['42']]);
	});

	test('converts array values into text array parameters for $nin', function () {
		const parameter_state = create_parameter_state();
		const sql_fragment = nin_operator("data->>'status'", ['paid', 1], parameter_state);

		expect(sql_fragment).toBe("NOT (data->>'status' = ANY($1::text[]))");
		expect(parameter_state.params).toEqual([['paid', '1']]);
	});

	test('accepts Set values through to_array for $all', function () {
		const parameter_state = create_parameter_state();
		const sql_fragment = all_operator('data', new Set(['electronics', 'gaming']), parameter_state);

		expect(sql_fragment).toBe('data @> $1::jsonb');
		expect(parameter_state.params).toEqual(['["electronics","gaming"]']);
	});

	test('serializes bigint values for JSONB operators', function () {
		const all_parameter_state = create_parameter_state();
		const contains_parameter_state = create_parameter_state();

		expect(all_operator('data', [1n, 2n], all_parameter_state)).toBe('data @> $1::jsonb');
		expect(all_parameter_state.params).toEqual(['["1","2"]']);

		expect(contains_operator('data', {id: 9007199254740993n}, contains_parameter_state)).toBe('data @> $1::jsonb');
		expect(contains_parameter_state.params).toEqual(['{"id":"9007199254740993"}']);
	});

	test('maps key existence operators to PostgreSQL jsonb operators', function () {
		const key_parameter_state = create_parameter_state();
		const any_parameter_state = create_parameter_state();
		const all_parameter_state = create_parameter_state();

		expect(has_key_operator('data', 'name', key_parameter_state)).toBe('data ? $1');
		expect(key_parameter_state.params).toEqual(['name']);

		expect(has_any_keys_operator('data', ['name', 'email'], any_parameter_state)).toBe('data ?| $1::text[]');
		expect(any_parameter_state.params).toEqual([['name', 'email']]);

		expect(has_all_keys_operator('data', new Set(['name', 'email']), all_parameter_state)).toBe('data ?& $1::text[]');
		expect(all_parameter_state.params).toEqual([['name', 'email']]);
	});

	test('maps JSONPath operators to PostgreSQL jsonpath operators', function () {
		const exists_parameter_state = create_parameter_state();
		const match_parameter_state = create_parameter_state();

		expect(jsonpath_exists_operator('data', '$.a ? (@ > 1)', exists_parameter_state)).toBe('data @? $1::jsonpath');
		expect(exists_parameter_state.params).toEqual(['$.a ? (@ > 1)']);

		expect(jsonpath_match_operator('data', '$.a > 1', match_parameter_state)).toBe('data @@ $1::jsonpath');
		expect(match_parameter_state.params).toEqual(['$.a > 1']);
	});

	test('throws a query error for invalid numeric input in $gt', function () {
		const parameter_state = create_parameter_state();

		expect(function run_gt_with_invalid_number() {
			gt_operator("data->>'age'", 'not-a-number', parameter_state);
		}).toThrow('Invalid value for $gt operator');
	});

	test('throws a query error for invalid numeric input in $gte', function () {
		const parameter_state = create_parameter_state();

		expect(function run_gte_with_invalid_number() {
			gte_operator("data->>'age'", 'not-a-number', parameter_state);
		}).toThrow('Invalid value for $gte operator');
	});

	test('throws a query error for invalid numeric input in $lt', function () {
		const parameter_state = create_parameter_state();

		expect(function run_lt_with_invalid_number() {
			lt_operator("data->>'age'", 'not-a-number', parameter_state);
		}).toThrow('Invalid value for $lt operator');
	});

	test('throws a query error for invalid numeric input in $lte', function () {
		const parameter_state = create_parameter_state();

		expect(function run_lte_with_invalid_number() {
			lte_operator("data->>'age'", 'not-a-number', parameter_state);
		}).toThrow('Invalid value for $lte operator');
	});

	test('binds bigint values without numeric precision loss in range operators', function () {
		const gt_parameter_state = create_parameter_state();
		const gte_parameter_state = create_parameter_state();
		const lt_parameter_state = create_parameter_state();
		const lte_parameter_state = create_parameter_state();

		const gt_sql_fragment = gt_operator("data->>'count'", 9007199254740993n, gt_parameter_state);
		const gte_sql_fragment = gte_operator("data->>'count'", 9007199254740993n, gte_parameter_state);
		const lt_sql_fragment = lt_operator("data->>'count'", 9007199254740993n, lt_parameter_state);
		const lte_sql_fragment = lte_operator("data->>'count'", 9007199254740993n, lte_parameter_state);

		expect(gt_sql_fragment).toBe("(data->>'count')::numeric > $1");
		expect(gt_parameter_state.params).toEqual(['9007199254740993']);
		expect(gte_sql_fragment).toBe("(data->>'count')::numeric >= $1");
		expect(gte_parameter_state.params).toEqual(['9007199254740993']);
		expect(lt_sql_fragment).toBe("(data->>'count')::numeric < $1");
		expect(lt_parameter_state.params).toEqual(['9007199254740993']);
		expect(lte_sql_fragment).toBe("(data->>'count')::numeric <= $1");
		expect(lte_parameter_state.params).toEqual(['9007199254740993']);
	});

	test('throws a query error for invalid numeric input in $size', function () {
		const parameter_state = create_parameter_state();

		expect(function run_size_with_invalid_number() {
			size_operator("data->'orders'", 'not-a-number', parameter_state);
		}).toThrow('Invalid value for $size operator');
	});

	test('binds numeric values with the current parameter index for $size', function () {
		const parameter_state = create_parameter_state(3);
		const sql_fragment = size_operator("data->'orders'", 2, parameter_state);

		expect(sql_fragment).toBe("jsonb_array_length(data->'orders') = $3");
		expect(parameter_state.params).toEqual([2]);
		expect(parameter_state.current_index).toBe(4);
	});
});
