import {describe, expect, test} from '@jest/globals';

import Schema from '#src/schema/schema.js';

describe('Schema advanced field type casting', function () {
	test('casts advanced scalar and union types', function () {
		const schema_instance = new Schema({
			price: {type: 'Decimal128'},
			count64: {type: 'BigInt'},
			ratio: {type: 'Double'},
			score: {type: 'Int32'},
			choice: {type: 'Union', of: ['Int32', Boolean]},
			raw_value: {type: 'Union', of: [String, 'Int32']}
		});

		const validated_payload = schema_instance.validate({
			price: 12.5,
			count64: '9007199254740993',
			ratio: '3.25',
			score: '42',
			choice: 'yes',
			raw_value: '42'
		});

		expect(validated_payload.price).toBe('12.5');
		expect(validated_payload.count64).toBe(9007199254740993n);
		expect(validated_payload.ratio).toBe(3.25);
		expect(validated_payload.score).toBe(42);
		expect(validated_payload.choice).toBe(true);
		expect(validated_payload.raw_value).toBe('42');
	});

	test('reports cast failures for invalid advanced values', function () {
		const schema_instance = new Schema({
			score: {type: 'Int32'},
			price: {type: 'Decimal128'}
		});

		expect(function validate_invalid_payload() {
			schema_instance.validate({
				score: '2147483648',
				price: 'not-a-decimal'
			});
		}).toThrow('Schema validation failed');
	});
});
