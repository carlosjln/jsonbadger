import {describe, expect, test} from '@jest/globals';

import jsonbadger, * as index_module from '#src/index.js';

describe('index exports', function () {
	test('exposes field_type namespace and removes top-level field-type helper exports', function () {
		expect(index_module.field_type).toBe(jsonbadger.field_type);
		expect(typeof index_module.field_type.register).toBe('function');
		expect(typeof index_module.field_type.resolve).toBe('function');

		expect(index_module.create_field_type).toBeUndefined();
		expect(index_module.register_field_type).toBeUndefined();
		expect(index_module.resolve_field_type).toBeUndefined();
	});
});
