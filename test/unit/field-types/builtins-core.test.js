import {describe, expect, test} from '@jest/globals';

import {
	ArrayFieldType,
	BooleanFieldType,
	BufferFieldType,
	DateFieldType,
	MapFieldType,
	NumberFieldType,
	StringFieldType,
	UUIDv7FieldType,
	get_foundational_field_types,
	uuidv7_pattern,
	uuidv7_type_reference
} from '#src/field-types/builtins/index.js';

describe('foundational FieldType builtins (direct)', function () {
	test('StringFieldType casts and validates match/enum/length options', function () {
		const field_type = new StringFieldType('name', {
			trim: true,
			lowercase: true,
			match: /^abc$/,
			enum: ['abc'],
			minLength: 2,
			maxLength: 4
		});
		const enum_only_field_type = new StringFieldType('name', {
			enum: ['abc']
		});
		const length_only_field_type = new StringFieldType('name', {
			minLength: 2,
			maxLength: 4
		});

		const casted_value = field_type.cast({
			toString: function () {
				return '  ABC  ';
			}
		});

		expect(casted_value).toBe('abc');
		field_type.run_type_validators('abc');
		expect(field_type.validators.map(function (validator_entry) {
			return validator_entry.kind;
		})).toEqual(expect.arrayContaining(['match', 'enum', 'minLength', 'maxLength']));

		expect(function cast_array_to_string() {
			field_type.cast(['x']);
		}).toThrow('Cast to String failed');
		expect(function validate_enum_miss() {
			enum_only_field_type.run_type_validators('zzz');
		}).toThrow('must be one of enum values');
		expect(function validate_short_string() {
			length_only_field_type.run_type_validators('a');
		}).toThrow('shorter than minLength');
		expect(function validate_long_string() {
			length_only_field_type.run_type_validators('abcde');
		}).toThrow('longer than maxLength');
	});

	test('NumberFieldType supports booleans and valueOf and validates enum/min/max', function () {
		const field_type = new NumberFieldType('age', {
			enum: [5],
			min: 4,
			max: 6
		});
		const min_only_field_type = new NumberFieldType('age', {min: 4});
		const max_only_field_type = new NumberFieldType('age', {max: 6});

		expect(field_type.cast(true)).toBe(1);
		expect(field_type.cast(false)).toBe(0);

		expect(field_type.cast({
			valueOf: function () {
				return 5;
			}
		})).toBe(5);

		expect(field_type.cast('5')).toBe(5);
		field_type.run_type_validators(5);

		expect(function cast_empty_string() {
			field_type.cast('   ');
		}).toThrow('Cast to Number failed');

		expect(function validate_enum_miss() {
			field_type.run_type_validators(3);
		}).toThrow('must be one of enum values');

		expect(function validate_lower_than_min() {
			min_only_field_type.run_type_validators(3);
		}).toThrow('lower than min');

		expect(function validate_greater_than_max() {
			max_only_field_type.run_type_validators(7);
		}).toThrow('greater than max');
	});

	test('DateFieldType casts and validates min/max boundaries', function () {
		const field_type = new DateFieldType('created_at', {
			min: '2026-01-01T00:00:00.000Z',
			max: '2026-12-31T23:59:59.999Z'
		});

		const casted_date = field_type.cast('2026-02-01T00:00:00.000Z');
		expect(casted_date instanceof Date).toBe(true);
		field_type.run_type_validators(casted_date);

		expect(function cast_invalid_date() {
			field_type.cast('not-a-date');
		}).toThrow('Cast to Date failed');

		expect(function validate_non_date() {
			field_type.run_type_validators('2026-02-01');
		}).toThrow('must be a Date');

		expect(function validate_before_min() {
			field_type.run_type_validators(new Date('2025-12-31T23:59:59.999Z'));
		}).toThrow('lower than min date');

		expect(function validate_after_max() {
			field_type.run_type_validators(new Date('2027-01-01T00:00:00.000Z'));
		}).toThrow('greater than max date');
	});

	test('BooleanFieldType and UUIDv7FieldType cast accepted values and reject invalid inputs', function () {
		const boolean_field = new BooleanFieldType('active', {});
		const uuid_field = new UUIDv7FieldType('owner_id', {});
		const uppercase_uuid = '0194F028-579A-7B5B-8107-B9AD31395F43';

		expect(boolean_field.cast('yes')).toBe(true);
		expect(boolean_field.cast('0')).toBe(false);
		expect(function cast_invalid_boolean() {
			boolean_field.cast('maybe');
		}).toThrow('Cast to Boolean failed');

		expect(uuid_field.cast(uppercase_uuid)).toBe(uppercase_uuid.toLowerCase());
		expect(uuidv7_pattern.test(uuid_field.cast(uppercase_uuid))).toBe(true);
		expect(function cast_invalid_uuidv7() {
			uuid_field.cast('not-a-uuid');
		}).toThrow('Cast to UUIDv7 failed');
	});

	test('BufferFieldType casts supported inputs and rejects unsupported shapes', function () {
		const field_type = new BufferFieldType('blob', {});

		expect(field_type.cast('A').toString('utf8')).toBe('A');
		expect(Array.from(field_type.cast(65))).toEqual([65]);
		expect(Array.from(field_type.cast([65, 66]))).toEqual([65, 66]);
		expect(Array.from(field_type.cast({type: 'Buffer', data: [67, 68]}))).toEqual([67, 68]);

		expect(function cast_invalid_buffer_shape() {
			field_type.cast({ok: true});
		}).toThrow('Cast to Buffer failed');
	});

	test('ArrayFieldType provides implicit default and normalizes items through child type', function () {
		const calls = [];
		const child_field_type = {
			normalize: function (value, context_value) {
				calls.push({value, context_value});
				return String(value).toUpperCase();
			}
		};
		const field_type = new ArrayFieldType('tags', {of_field_type: child_field_type});

		expect(field_type.resolve_default()).toEqual([]);
		expect(field_type.cast(['a', 'b'], {mode: 'save'})).toEqual(['A', 'B']);
		expect(calls).toEqual([
			{
				value: 'a',
				context_value: {
					path: 'tags.0',
					parent_path: 'tags',
					parent_instance: 'Array',
					parent_context: {mode: 'save'}
				}
			},
			{
				value: 'b',
				context_value: {
					path: 'tags.1',
					parent_path: 'tags',
					parent_instance: 'Array',
					parent_context: {mode: 'save'}
				}
			}
		]);

		expect(function cast_non_array() {
			field_type.cast('not-array');
		}).toThrow('Cast to Array failed');
	});

	test('MapFieldType casts objects and maps and validates string keys', function () {
		const calls = [];
		const child_field_type = {
			normalize: function (value, context_value) {
				calls.push({value, context_value});
				return String(value).toUpperCase();
			}
		};
		const field_type = new MapFieldType('handles', {of_field_type: child_field_type});

		expect(field_type.cast({github: 'alice'}, {mode: 'save'})).toEqual({github: 'ALICE'});
		expect(field_type.cast(new Map([['x', 'y']]))).toEqual({x: 'Y'});
		expect(calls[0]).toEqual({
			value: 'alice',
			context_value: {
				path: 'handles.github',
				parent_path: 'handles',
				parent_instance: 'Map',
				parent_context: {mode: 'save'}
			}
		});

		expect(function cast_invalid_map_key() {
			field_type.cast(new Map([[1, 'value']]));
		}).toThrow('Map key must be a string');

		expect(function cast_invalid_map_input() {
			field_type.cast(['nope']);
		}).toThrow('Cast to Map failed');
	});


	test('covers nullish and remaining foundational cast branches', function () {
		const string_field = new StringFieldType('name', {uppercase: true, match: /^ABC$/});
		const number_field = new NumberFieldType('age', {});
		const date_field = new DateFieldType('created_at', {});
		const boolean_field = new BooleanFieldType('active', {});
		const uuid_field = new UUIDv7FieldType('owner_id', {});
		const buffer_field = new BufferFieldType('blob', {});
		const array_no_options = new ArrayFieldType('tags');
		const array_with_default = new ArrayFieldType('tags', {default: ['seed']});
		const map_no_options = new MapFieldType('meta');
		const array_child = new ArrayFieldType('tags', {
			of_field_type: {
				normalize: function (value, context_value) {
					return context_value.parent_context;
				}
			}
		});

		expect(string_field.cast(undefined)).toBeUndefined();
		expect(string_field.cast(null)).toBeNull();
		expect(string_field.cast('abc')).toBe('ABC');

		expect(function cast_default_object_to_string() {
			string_field.cast({});
		}).toThrow('Cast to String failed');

		expect(function validate_regex_miss() {
			string_field.run_type_validators('zzz');
		}).toThrow('does not match pattern');

		expect(number_field.cast(undefined)).toBeUndefined();
		expect(number_field.cast(null)).toBeNull();
		expect(number_field.cast(5)).toBe(5);

		expect(function cast_number_array() {
			number_field.cast([]);
		}).toThrow('Cast to Number failed');

		expect(function cast_non_finite_number() {
			number_field.cast(Number.POSITIVE_INFINITY);
		}).toThrow('Cast to Number failed');

		expect(function cast_non_finite_numeric_string() {
			number_field.cast('Infinity');
		}).toThrow('Cast to Number failed');

		expect(function cast_invalid_value_of_number() {
			number_field.cast({valueOf: function () {return 'nope';}});
		}).toThrow('Cast to Number failed');

		const now = new Date('2026-02-02T00:00:00.000Z');

		expect(date_field.cast(undefined)).toBeUndefined();
		expect(date_field.cast(null)).toBeNull();
		expect(date_field.cast(now)).toBe(now);

		expect(function cast_invalid_date_instance() {
			date_field.cast(new Date('invalid'));
		}).toThrow('Cast to Date failed');

		expect(boolean_field.cast(undefined)).toBeUndefined();
		expect(boolean_field.cast(null)).toBeNull();

		expect(uuid_field.cast(undefined)).toBeUndefined();
		expect(uuid_field.cast(null)).toBeNull();

		expect(function cast_non_string_uuidv7() {
			uuid_field.cast(123);
		}).toThrow('Cast to UUIDv7 failed');

		const raw_buffer = Buffer.from('Z');

		expect(buffer_field.cast(undefined)).toBeUndefined();
		expect(buffer_field.cast(null)).toBeNull();
		expect(buffer_field.cast(raw_buffer)).toBe(raw_buffer);

		expect(function cast_invalid_buffer_array_items() {
			buffer_field.cast([Symbol('x')]);
		}).toThrow('Cast to Buffer failed');

		expect(function cast_invalid_serialized_buffer_data() {
			buffer_field.cast({type: 'Buffer', data: [Symbol('x')]});
		}).toThrow('Cast to Buffer failed');

		expect(array_no_options.of_field_type).toBeNull();
		expect(array_no_options.cast(undefined)).toBeUndefined();
		expect(array_no_options.cast(null)).toBeNull();

		const raw_array = [1, 2];

		expect(array_no_options.cast(raw_array)).toBe(raw_array);
		expect(array_with_default.resolve_default()).toEqual(['seed']);
		expect(array_child.cast(['x'])).toEqual([{}]);

		expect(map_no_options.of_field_type).toBeNull();
		expect(map_no_options.cast(undefined)).toBeUndefined();
		expect(map_no_options.cast(null)).toBeNull();
		expect(map_no_options.cast({a: 1})).toEqual({a: 1});
	});

	test('foundational registry exports include all expected builtins and UUIDv7 reference helper', function () {
		const foundational_types = get_foundational_field_types();

		expect(typeof uuidv7_type_reference).toBe('function');
		expect(uuidv7_type_reference()).toBeUndefined();
		expect(Object.keys(foundational_types)).toEqual(expect.arrayContaining([
			'String',
			'Number',
			'Date',
			'Boolean',
			'UUIDv7',
			'Buffer',
			'Mixed',
			'Array',
			'Map',
			'Decimal128',
			'BigInt',
			'Double',
			'Int32',
			'Union'
		]));
		expect(foundational_types.UUIDv7.references).toEqual(expect.arrayContaining(['UUIDv7']));
	});
});
