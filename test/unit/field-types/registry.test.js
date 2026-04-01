import {describe, expect, test} from '@jest/globals';

import {
	create,
	FieldTypeRegistry,
	register,
	resolve
} from '#src/field-types/registry.js';

function DummyFieldType(path_value, options) {
	this.path = path_value;
	this.options = options;
}

function DummyChildFieldType() {
	return;
}

DummyChildFieldType.prototype.normalize = function (value) {
	return value;
};

DummyChildFieldType.prototype.cast = function (value) {
	return value;
};

describe('FieldTypeRegistry', function () {
	test('handles missing aliases, direct-name fallback resolution, and unsupported types', function () {
		const registry = new FieldTypeRegistry();

		registry.register('CustomNoRefs', DummyFieldType);

		expect(registry.has_field_type(Symbol('missing'))).toBe(false);
		expect(registry.resolve('CustomNoRefs')).toBe('CustomNoRefs');

		registry.type_name_by_alias.delete('CustomNoRefs');
		expect(registry.resolve('CustomNoRefs')).toBe('CustomNoRefs');

		const created = registry.create('payload.value', 'CustomNoRefs');
		expect(created).toBeInstanceOf(DummyFieldType);
		expect(created.path).toBe('payload.value');
		expect(created.options).toEqual({});

		expect(function create_unsupported_field_type() {
			registry.create('payload.unknown', 'MissingType');
		}).toThrow('Unsupported field type at path "payload.unknown"');
	});

	test('deep-clones nested field options without breaking function options', function () {
		const registry = new FieldTypeRegistry();
		const validate = function () {
			return true;
		};
		const field_options = {
			validate: validate,
			nested: {
				enabled: true
			}
		};

		registry.register('CustomNoRefs', DummyFieldType);

		const created = registry.create('payload.value', 'CustomNoRefs', field_options);

		field_options.nested.enabled = false;
		created.options.nested.enabled = 'changed';

		expect(created.options).toEqual({
			validate: validate,
			nested: {
				enabled: 'changed'
			}
		});
		expect(created.options).not.toBe(field_options);
		expect(created.options.nested).not.toBe(field_options.nested);
		expect(created.options.validate).toBe(validate);
		expect(field_options.nested.enabled).toBe(false);
	});

	test('preserves regex options and live child field types in fallback clone paths', function () {
		const registry = new FieldTypeRegistry();
		const original_structured_clone = globalThis.structuredClone;
		const child_field_type = new DummyChildFieldType();
		const field_options = {
			validate: function () {
				return true;
			},
			match: /^[a-z]+$/i,
			of_field_type: child_field_type
		};

		registry.register('CustomNoRefs', DummyFieldType);
		globalThis.structuredClone = undefined;

		try {
			const created = registry.create('payload.value', 'CustomNoRefs', field_options);

			expect(created.options).not.toBe(field_options);
			expect(created.options.match).toBeInstanceOf(RegExp);
			expect(created.options.match).not.toBe(field_options.match);
			expect(created.options.match.source).toBe(field_options.match.source);
			expect(created.options.match.flags).toBe(field_options.match.flags);
			expect(created.options.of_field_type).toBe(child_field_type);
		} finally {
			globalThis.structuredClone = original_structured_clone;
		}
	});

	test('supports the default exported registry wrappers for register, resolve, and create', function () {
		register('WrapperDummyFieldType', DummyFieldType, ['wrapper-dummy']);

		expect(resolve('WrapperDummyFieldType')).toBe('WrapperDummyFieldType');
		expect(resolve('wrapper-dummy')).toBe('WrapperDummyFieldType');

		const created = create('payload.wrapper_value', 'wrapper-dummy', {
			required: true
		});

		expect(created).toBeInstanceOf(DummyFieldType);
		expect(created.path).toBe('payload.wrapper_value');
		expect(created.options).toEqual({
			required: true
		});
	});
});
