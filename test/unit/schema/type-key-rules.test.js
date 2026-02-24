import {describe, expect, test} from '@jest/globals';

import Schema from '#src/schema/schema.js';

describe('Schema type-key interpretation rules', function () {
	test('supports implicit and explicit definitions', function () {
		const schema_instance = new Schema({
			name: String,
			age: {
				type: Number,
				required: true
			}
		});

		expect(schema_instance.path('name').instance).toBe('String');
		expect(schema_instance.path('age').instance).toBe('Number');
		expect(schema_instance.path('age').options.required).toBe(true);
	});

	test('treats object with direct type key as explicit field type declaration', function () {
		const schema_instance = new Schema({
			asset: {
				type: String,
				ticker: String
			}
		});

		expect(schema_instance.path('asset').instance).toBe('String');
		expect(schema_instance.path('asset.ticker')).toBe(null);
	});

	test('allows literal field named "type" when nested definition is explicit', function () {
		const schema_instance = new Schema({
			asset: {
				type: {type: String},
				ticker: {type: String}
			}
		});

		expect(schema_instance.path('asset')).toBe(null);
		expect(schema_instance.path('asset.type').instance).toBe('String');
		expect(schema_instance.path('asset.ticker').instance).toBe('String');
	});
});
