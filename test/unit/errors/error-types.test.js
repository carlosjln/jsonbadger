import {describe, expect, test} from '@jest/globals';

import QueryError from '#src/errors/query-error.js';
import ValidationError from '#src/errors/validation-error.js';

describe('error types', function () {
	test('QueryError applies defaults and serializes response payload', function () {
		const error_instance = new QueryError();

		expect(error_instance instanceof Error).toBe(true);
		expect(error_instance.name).toBe('query_error');
		expect(error_instance.message).toBe('Query failed');
		expect(error_instance.details).toBe(null);
		expect(error_instance.to_json()).toEqual({
			success: false,
			error: {
				type: 'query_error',
				message: 'Query failed',
				details: null
			}
		});
	});

	test('QueryError preserves explicit message and details', function () {
		const details = {sql: 'SELECT 1'};
		const error_instance = new QueryError('custom query failure', details);

		expect(error_instance.message).toBe('custom query failure');
		expect(error_instance.details).toBe(details);
		expect(error_instance.to_json().error).toEqual({
			type: 'query_error',
			message: 'custom query failure',
			details
		});
	});

	test('ValidationError applies defaults and serializes response payload', function () {
		const error_instance = new ValidationError();

		expect(error_instance instanceof Error).toBe(true);
		expect(error_instance.name).toBe('validation_error');
		expect(error_instance.message).toBe('Validation failed');
		expect(error_instance.details).toBe(null);
		expect(error_instance.to_json()).toEqual({
			success: false,
			error: {
				type: 'validation_error',
				message: 'Validation failed',
				details: null
			}
		});
	});

	test('ValidationError preserves explicit message and details', function () {
		const details = [{path: 'name', code: 'required_error'}];
		const error_instance = new ValidationError('custom validation failure', details);

		expect(error_instance.message).toBe('custom validation failure');
		expect(error_instance.details).toBe(details);
		expect(error_instance.to_json().error).toEqual({
			type: 'validation_error',
			message: 'custom validation failure',
			details
		});
	});
});