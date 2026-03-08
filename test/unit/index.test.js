import {describe, expect, test} from '@jest/globals';

import jsonbadger, * as index_module from '#src/index.js';

describe('index exports', function () {
	test('exposes connection-first surface and removes top-level field-type/model helper exports', function () {
		expect(index_module.field_type).toBe(jsonbadger.field_type);
		expect(typeof index_module.field_type.register).toBe('function');
		expect(typeof index_module.field_type.resolve).toBe('function');
		expect(index_module.disconnect).toBeUndefined();
		expect(jsonbadger.disconnect).toBeUndefined();
		expect(index_module.model).toBeUndefined();
		expect(jsonbadger.model).toBeUndefined();

		expect(index_module.create_field_type).toBeUndefined();
		expect(index_module.register_field_type).toBeUndefined();
		expect(index_module.resolve_field_type).toBeUndefined();
	});
});
