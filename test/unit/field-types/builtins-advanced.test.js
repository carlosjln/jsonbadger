import {describe, expect, test} from '@jest/globals';

import {
	BigIntFieldType,
	Decimal128FieldType,
	DoubleFieldType,
	INT32_MAX,
	INT32_MIN,
	Int32FieldType,
	UnionFieldType,
	decimal128_type_reference,
	double_type_reference,
	int32_type_reference,
	union_type_reference
} from '#src/field-types/builtins/advanced.js';
import {
	ArrayFieldType,
	BooleanFieldType,
	BufferFieldType,
	DateFieldType,
	MapFieldType,
	MixedFieldType,
	NumberFieldType,
	StringFieldType
} from '#src/field-types/builtins/index.js';

describe('advanced FieldType builtins (direct)', function () {
	test('advanced type reference helpers are callable placeholders', function () {
		expect(decimal128_type_reference()).toBeUndefined();
		expect(double_type_reference()).toBeUndefined();
		expect(int32_type_reference()).toBeUndefined();
		expect(union_type_reference()).toBeUndefined();
		expect(INT32_MIN).toBeLessThan(0);
		expect(INT32_MAX).toBeGreaterThan(0);
	});

	test('Decimal128FieldType casts supported values and rejects invalid decimals', function () {
		const field_type = new Decimal128FieldType('price', {});

		expect(field_type.cast(12.5)).toBe('12.5');
		expect(field_type.cast(12n)).toBe('12');
		expect(field_type.cast('  7.25e+1  ')).toBe('7.25e+1');
		expect(field_type.cast({
			valueOf: function () {
				return '3.5';
			}
		})).toBe('3.5');

		expect(function cast_infinite_number() {
			field_type.cast(Number.POSITIVE_INFINITY);
		}).toThrow('Cast to Decimal128 failed');
		expect(function cast_invalid_decimal() {
			field_type.cast('abc');
		}).toThrow('Cast to Decimal128 failed');
	});

	test('BigIntFieldType casts booleans, numbers, strings and valueOf results', function () {
		const field_type = new BigIntFieldType('count64', {});

		expect(field_type.cast(true)).toBe(1n);
		expect(field_type.cast(false)).toBe(0n);
		expect(field_type.cast(42)).toBe(42n);
		expect(field_type.cast('  9001  ')).toBe(9001n);
		expect(field_type.cast({
			valueOf: function () {
				return '77';
			}
		})).toBe(77n);

		expect(function cast_decimal_string() {
			field_type.cast('1.5');
		}).toThrow('Cast to BigInt failed');
		expect(function cast_non_integer_number() {
			field_type.cast(3.14);
		}).toThrow('Cast to BigInt failed');
	});

	test('DoubleFieldType casts supported values and handles empty-string null behavior', function () {
		const field_type = new DoubleFieldType('ratio', {});

		expect(field_type.cast(true)).toBe(1);
		expect(field_type.cast(false)).toBe(0);
		expect(field_type.cast(' 2.5 ')).toBe(2.5);
		expect(field_type.cast('   ')).toBeNull();
		expect(field_type.cast({
			valueOf: function () {
				return 9.5;
			}
		})).toBe(9.5);

		expect(function cast_invalid_double() {
			field_type.cast('nope');
		}).toThrow('Cast to Double failed');
	});

	test('Int32FieldType enforces integer and int32 bounds', function () {
		const field_type = new Int32FieldType('score', {});

		expect(field_type.cast(true)).toBe(1);
		expect(field_type.cast(false)).toBe(0);
		expect(field_type.cast('42')).toBe(42);
		expect(field_type.cast('   ')).toBeNull();
		expect(field_type.cast({
			valueOf: function () {
				return 11;
			}
		})).toBe(11);
		expect(field_type.cast(INT32_MIN)).toBe(INT32_MIN);
		expect(field_type.cast(INT32_MAX)).toBe(INT32_MAX);

		expect(function cast_out_of_range() {
			field_type.cast(INT32_MAX + 1);
		}).toThrow('Cast to Int32 failed');
		expect(function cast_float() {
			field_type.cast(4.2);
		}).toThrow('Cast to Int32 failed');
	});

	test('UnionFieldType rejects empty candidates and adds union validator marker', function () {
		const field_type = new UnionFieldType('choice', {});

		expect(field_type.of_field_types).toEqual([]);
		expect(field_type.validators.map(function (validator_entry) {
			return validator_entry.kind;
		})).toContain('union');
		expect(function cast_without_candidates() {
			field_type.cast('x');
		}).toThrow('requires at least one candidate type');
	});

	test('UnionFieldType exact-match path returns original values for known instances', function () {
		const string_union = new UnionFieldType('name', {of_field_types: [new StringFieldType('name', {})]});
		const date_union = new UnionFieldType('created_at', {of_field_types: [new DateFieldType('created_at', {})]});
		const buffer_union = new UnionFieldType('blob', {of_field_types: [new BufferFieldType('blob', {})]});
		const array_union = new UnionFieldType('tags', {of_field_types: [new ArrayFieldType('tags', {})]});
		const map_union = new UnionFieldType('meta', {of_field_types: [new MapFieldType('meta', {})]});
		const mixed_union = new UnionFieldType('payload', {of_field_types: [new MixedFieldType('payload', {})]});
		const valid_date = new Date('2026-02-01T00:00:00.000Z');
		const buffer_value = Buffer.from('AB');
		const array_value = ['a', 'b'];
		const map_like_value = {region: 'us'};
		const payload_value = {nested: true};

		expect(string_union.cast('alice')).toBe('alice');
		expect(date_union.cast(valid_date)).toBe(valid_date);
		expect(buffer_union.cast(buffer_value)).toBe(buffer_value);
		expect(array_union.cast(array_value)).toBe(array_value);
		expect(map_union.cast(map_like_value)).toBe(map_like_value);
		expect(mixed_union.cast(payload_value)).toBe(payload_value);
	});

	test('UnionFieldType falls back to candidate normalization and returns last error when all fail', function () {
		const call_log = [];
		const first_candidate = {
			instance: 'Custom',
			apply_set: function (value) {
				call_log.push(['first_apply_set', value]);
				return value;
			},
			cast: function () {
				call_log.push(['first_cast']);
				throw new Error('first failed');
			},
			validate: function () {
				call_log.push(['first_validate']);
			}
		};

		const second_candidate = {
			instance: 'Custom',
			apply_set: function (value, context_value) {
				call_log.push(['second_apply_set', value, context_value.mode]);
				return String(value) + ':set';
			},
			cast: function (value) {
				call_log.push(['second_cast', value]);
				return value.toUpperCase();
			},
			validate: function (value, context_value) {
				call_log.push(['second_validate', value, context_value.mode]);
			}
		};

		const successful_union = new UnionFieldType('choice', {of_field_types: [first_candidate, second_candidate]});
		const failing_union = new UnionFieldType('choice', {
			of_field_types: [{
				instance: 'Custom',
				cast: function () {
					throw new Error('last candidate failed');
				},
				validate: function () {
					return;
				}
			}]
		});

		expect(successful_union.cast('ok', {mode: 'save'})).toBe('OK:SET');
		expect(call_log).toEqual([
			['first_apply_set', 'ok'],
			['first_cast'],
			['second_apply_set', 'ok', 'save'],
			['second_cast', 'ok:set'],
			['second_validate', 'OK:SET', 'save']
		]);
		expect(function cast_all_candidates_fail() {
			failing_union.cast('x');
		}).toThrow('last candidate failed');
	});


	test('covers nullish and terminal advanced cast branches', function () {
		const decimal_field = new Decimal128FieldType('price', {});
		const bigint_field = new BigIntFieldType('count64', {});
		const double_field = new DoubleFieldType('ratio', {});
		const int32_field = new Int32FieldType('score', {});
		const union_field = new UnionFieldType('choice', {of_field_types: [new StringFieldType('choice', {})]});

		expect(decimal_field.cast(undefined)).toBeUndefined();
		expect(decimal_field.cast(null)).toBeNull();
		expect(function decimal_valueof_self_fails() {
			const self_ref = {valueOf: function () {return self_ref;}};
			decimal_field.cast(self_ref);
		}).toThrow('Cast to Decimal128 failed');

		expect(bigint_field.cast(undefined)).toBeUndefined();
		expect(bigint_field.cast(null)).toBeNull();
		expect(bigint_field.cast(5n)).toBe(5n);
		expect(function bigint_valueof_self_fails() {
			const self_ref = {valueOf: function () {return self_ref;}};
			bigint_field.cast(self_ref);
		}).toThrow('Cast to BigInt failed');

		const original_bigint = globalThis.BigInt;
		globalThis.BigInt = function () {
			throw new Error('forced bigint failure');
		};

		try {
			expect(function bigint_constructor_throw_is_wrapped() {
				bigint_field.cast('10');
			}).toThrow('Cast to BigInt failed');
		} finally {
			globalThis.BigInt = original_bigint;
		}

		expect(double_field.cast(undefined)).toBeUndefined();
		expect(double_field.cast(null)).toBeNull();
		expect(function cast_non_finite_double_number() {
			double_field.cast(Number.POSITIVE_INFINITY);
		}).toThrow('Cast to Double failed');

		expect(function double_valueof_self_fails() {
			const self_ref = {valueOf: function () {return self_ref;}};
			double_field.cast(self_ref);
		}).toThrow('Cast to Double failed');

		expect(int32_field.cast(undefined)).toBeUndefined();
		expect(int32_field.cast(null)).toBeNull();
		expect(function int32_valueof_self_fails() {
			const self_ref = {valueOf: function () {return self_ref;}};
			int32_field.cast(self_ref);
		}).toThrow('Cast to Int32 failed');

		expect(union_field.cast(undefined)).toBeUndefined();
		expect(union_field.cast(null)).toBeNull();
	});

	test('UnionFieldType exact-match covers number, double, int32, bigint, and fallback branch without last error', function () {
		const number_union = new UnionFieldType('n', {of_field_types: [new NumberFieldType('n', {})]});
		const double_union = new UnionFieldType('d', {of_field_types: [new DoubleFieldType('d', {})]});
		const int32_union = new UnionFieldType('i', {of_field_types: [new Int32FieldType('i', {})]});
		const bigint_union = new UnionFieldType('b', {of_field_types: [new BigIntFieldType('b', {})]});
		const weird_union = new UnionFieldType('w', {of_field_types: [new StringFieldType('w', {})]});
		let length_reads = 0;

		expect(number_union.cast(12)).toBe(12);
		expect(double_union.cast(1.25)).toBe(1.25);
		expect(int32_union.cast(33)).toBe(33);
		expect(bigint_union.cast(44n)).toBe(44n);

		// Trigger false paths inside exact Int32 checks before falling back to normalization or throwing.
		expect(int32_union.cast('55')).toBe(55);
		expect(function int32_non_integer_not_exact_match() {
			int32_union.cast(4.2);
		}).toThrow('Cast to Int32 failed');

		expect(function int32_out_of_range_not_exact_match() {
			int32_union.cast(INT32_MAX + 1);
		}).toThrow('Cast to Int32 failed');

		weird_union.of_field_types = {
			get length() {
				length_reads += 1;
				return length_reads === 1 ? 1 : 0;
			}
		};

		expect(function union_throws_generic_cast_error_when_second_loop_is_skipped() {
			weird_union.cast('x');
		}).toThrow('Cast to Union failed for path "w"');
	});

	test('UnionFieldType exact-match recognizes booleans through Boolean candidate', function () {
		const field_type = new UnionFieldType('flag', {of_field_types: [new BooleanFieldType('flag', {})]});

		expect(field_type.cast(true)).toBe(true);
		expect(field_type.cast(false)).toBe(false);
	});
});
