import {describe, expect, test} from '@jest/globals';

import schema_compiler from '#src/schema/schema-compiler.js';

describe('schema_compiler branch behavior', function () {
	test('returns validation_error details for non-object payloads', function () {
		const compiler = schema_compiler({name: String});

		const null_result = compiler.validate(null);
		const array_result = compiler.validate([]);

		expect(null_result).toEqual({
			value: null,
			error: {
				details: [
					{
						path: '',
						code: 'validation_error',
						message: 'Schema validation failed',
						type: 'object'
					}
				]
			}
		});

		expect(array_result.error.details[0].type).toBe('object');
	});

	test('preserves unknown keys and skips writes when normalized value is undefined', function () {
		const compiler = schema_compiler({
			optional_name: String
		});

		const payload = {
			other_key: 42
		};

		const result = compiler.validate(payload);

		expect(result.error).toBeNull();
		expect(result.value).toEqual({other_key: 42});
		expect(result.value).not.toBe(payload);
		expect(result.value).not.toHaveProperty('optional_name');
	});

	test('clones unknown Date and Buffer values and writes nested defaults through replaced containers', function () {
		const compiler = schema_compiler({
			profile: {
				city: {type: String, default: 'unknown'}
			}
		});

		const original_date = new Date('2026-02-24T00:00:00.000Z');
		const original_buffer = Buffer.from('AB');
		const cases = [undefined, null, 'invalid', []];
		let case_index = 0;

		while(case_index < cases.length) {
			const payload = {
				profile: cases[case_index],
				created_at: original_date,
				raw: original_buffer
			};

			const result = compiler.validate(payload);

			expect(result.error).toBeNull();
			expect(result.value.profile).toEqual({city: 'unknown'});
			expect(result.value.created_at instanceof Date).toBe(true);
			expect(result.value.created_at.getTime()).toBe(original_date.getTime());
			expect(result.value.created_at).not.toBe(original_date);
			expect(Buffer.isBuffer(result.value.raw)).toBe(true);
			expect(result.value.raw.equals(original_buffer)).toBe(true);
			expect(result.value.raw).not.toBe(original_buffer);

			if(cases[case_index] !== undefined) {
				expect(payload.profile).toBe(cases[case_index]);
			}

			case_index += 1;
		}
	});
});
