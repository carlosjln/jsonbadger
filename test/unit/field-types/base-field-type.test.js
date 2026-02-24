import {describe, expect, test} from '@jest/globals';

import BaseFieldType from '#src/field-types/base-field-type.js';

function TestFieldType(path_value, options) {
	BaseFieldType.call(this, path_value, options);
	this.instance = 'Test';
	this.cast_calls = [];
	this.validate_calls = [];
}

TestFieldType.prototype = Object.create(BaseFieldType.prototype);
TestFieldType.prototype.constructor = TestFieldType;

TestFieldType.prototype.cast = function (value, context_value) {
	this.cast_calls.push({value, context_value});
	return 'cast:' + value;
};

TestFieldType.prototype.run_type_validators = function (value, context_value) {
	this.validate_calls.push({value, context_value});

	if(this.options.fail_type_validator === true) {
		throw this.create_field_error('validator_error', 'Type validator failed', value);
	}
};

describe('BaseFieldType', function () {
	test('registers universal validators and returns introspection metadata', function () {
		const field_type = new BaseFieldType('profile.name', {
			required: true,
			validate: function () {
				return true;
			}
		});

		field_type.regExp = /^a/;
		field_type.enum_values = ['a', 'b'];

		expect(field_type.validators).toEqual([
			{kind: 'required'},
			{kind: 'custom'}
		]);
		expect(field_type.cast('value')).toBe('value');
		expect(field_type.run_type_validators()).toBeUndefined();
		expect(field_type.to_introspection()).toEqual({
			path: 'profile.name',
			instance: 'Mixed',
			validators: [{kind: 'required'}, {kind: 'custom'}],
			regExp: /^a/,
			enum_values: ['a', 'b']
		});
	});

	test('resolves required/default/set/get from functions using context', function () {
		const field_type = new BaseFieldType('count', {
			required: function (context_value) {
				return context_value.require_count;
			},
			default: function (context_value) {
				return context_value.seed;
			},
			set: function (value, context_value) {
				return String(value) + ':' + context_value.mode;
			},
			get: function (value, context_value) {
				return String(value) + ':' + context_value.mode;
			}
		});

		expect(field_type.is_required({require_count: true})).toBe(true);
		expect(field_type.is_required({require_count: false})).toBe(false);
		expect(field_type.resolve_default({seed: 42})).toBe(42);
		expect(field_type.apply_set('abc', {mode: 'save'})).toBe('abc:save');
		expect(field_type.apply_get('abc', {mode: 'read'})).toBe('abc:read');
		expect(field_type.apply_set('abc')).toBe('abc:undefined');
		expect(field_type.apply_get('abc')).toBe('abc:undefined');
	});

	test('normalize applies default, set, cast and validators in order', function () {
		const field_type = new TestFieldType('title', {
			default: function () {
				return 'seed';
			},
			set: function (value) {
				return value + ':set';
			},
			validate: function (value, context_value) {
				return value === 'cast:seed:set' && context_value.mode === 'save';
			}
		});

		const normalized_value = field_type.normalize(undefined, {mode: 'save'});

		expect(normalized_value).toBe('cast:seed:set');
		expect(field_type.cast_calls).toEqual([
			{
				value: 'seed:set',
				context_value: {mode: 'save'}
			}
		]);

		expect(field_type.validate_calls).toEqual([
			{
				value: 'cast:seed:set',
				context_value: {mode: 'save'}
			}
		]);
	});

	test('normalize returns nullish values unless required and reports required errors', function () {
		const optional_field = new BaseFieldType('optional_field', {});
		const required_field = new BaseFieldType('required_field', {required: true});

		expect(optional_field.normalize(undefined)).toBeUndefined();
		expect(optional_field.normalize(null)).toBeNull();

		expect(function normalize_required_undefined() {
			required_field.normalize(undefined);
		}).toThrow('Path "required_field" is required');

		try {
			required_field.normalize(null);
		} catch(error) {
			expect(error.code).toBe('required_error');
			expect(error.path).toBe('required_field');
			expect(error.value).toBe(null);
		}
	});

	test('run_custom_validator wraps false returns and thrown errors as field errors', function () {
		const false_validator_field = new BaseFieldType('value_false', {
			validate: function () {
				return false;
			}
		});

		const thrown_message_field = new BaseFieldType('value_throw_message', {
			validate: function () {
				throw new Error('validator exploded');
			}
		});

		const thrown_non_error_field = new BaseFieldType('value_throw_unknown', {
			validate: function () {
				throw 'boom';
			}
		});

		expect(function run_false_validator() {
			false_validator_field.run_custom_validator('x');
		}).toThrow('Custom validator failed for path "value_false"');

		try {
			thrown_message_field.run_custom_validator('y');
		} catch(error) {
			expect(error.code).toBe('validator_error');
			expect(error.message).toBe('validator exploded');
			expect(error.path).toBe('value_throw_message');
			expect(error.value).toBe('y');
		}

		try {
			thrown_non_error_field.run_custom_validator('z');
		} catch(error) {
			expect(error.code).toBe('validator_error');
			expect(error.message).toBe('Custom validator failed for path "value_throw_unknown"');
			expect(error.path).toBe('value_throw_unknown');
			expect(error.value).toBe('z');
		}
	});

	test('validate delegates to custom and type validators', function () {
		const call_order = [];
		const field_type = new BaseFieldType('delegated', {
			validate: function () {
				call_order.push('custom');
				return true;
			}
		});

		field_type.run_type_validators = function () {
			call_order.push('type');
		};

		field_type.validate('value', {mode: 'save'});
		expect(call_order).toEqual(['custom', 'type']);
	});

	test('covers option/context fallbacks and null introspection defaults', function () {
		const field_type_without_options = new BaseFieldType('fallbacks');
		const contexts = [];
		const field_type = new BaseFieldType('fallback_contexts', {
			required: function (context_value) {
				contexts.push(['required', context_value]);
				return false;
			},
			default: function (context_value) {
				contexts.push(['default', context_value]);
				return 'seed';
			},
			validate: function (value, context_value) {
				contexts.push(['custom', value, context_value]);
				return true;
			}
		});

		field_type.run_type_validators = function (value, context_value) {
			contexts.push(['type', value, context_value]);
		};

		expect(field_type_without_options.options).toEqual({});
		expect(field_type_without_options.apply_get('raw')).toBe('raw');
		expect(field_type_without_options.to_introspection()).toEqual({
			path: 'fallbacks',
			instance: 'Mixed',
			validators: [],
			regExp: null,
			enum_values: null
		});

		expect(field_type.is_required()).toBe(false);
		expect(field_type.resolve_default()).toBe('seed');
		field_type.validate('value');

		expect(contexts).toEqual([
			['required', {}],
			['default', {}],
			['custom', 'value', {}],
			['type', 'value', {}]
		]);
	});

});
