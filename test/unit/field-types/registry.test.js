import {describe, expect, test} from '@jest/globals';

import {FieldTypeRegistry} from '#src/field-types/registry.js';

function DummyFieldType(path_value, options) {
	this.path = path_value;
	this.options = options;
}

describe('FieldTypeRegistry', function () {
	test('handles missing references, direct-name fallback resolution, and unsupported types', function () {
		const registry = new FieldTypeRegistry();

		registry.register_field_type('CustomNoRefs', DummyFieldType);

		expect(registry.has_field_type(Symbol('missing'))).toBe(false);
		expect(registry.resolve_field_type_name('CustomNoRefs')).toBe('CustomNoRefs');

		registry.type_name_by_reference.delete('CustomNoRefs');
		expect(registry.resolve_field_type_name('CustomNoRefs')).toBe('CustomNoRefs');

		const created = registry.create_field_type('payload.value', 'CustomNoRefs');
		expect(created).toBeInstanceOf(DummyFieldType);
		expect(created.path).toBe('payload.value');
		expect(created.options).toEqual({});

		expect(function create_unsupported_field_type() {
			registry.create_field_type('payload.unknown', 'MissingType');
		}).toThrow('Unsupported field type at path "payload.unknown"');
	});
});
