import {describe, expect, test} from '@jest/globals';

import ModelOverwriteError from '#src/errors/model-overwrite-error.js';
import QueryError from '#src/errors/query-error.js';
import ValidationError from '#src/errors/validation-error.js';

const error_cases = [
	{
		ErrorType: QueryError,
		type: 'query_error',
		default_message: 'Query failed',
		explicit_message: 'custom query failure',
		explicit_details: {sql: 'SELECT 1'}
	},
	{
		ErrorType: ValidationError,
		type: 'validation_error',
		default_message: 'Validation failed',
		explicit_message: 'custom validation failure',
		explicit_details: [{path: 'name', code: 'required_error'}]
	},
	{
		ErrorType: ModelOverwriteError,
		type: 'model_overwrite_error',
		default_message: 'Model overwrite failed',
		explicit_message: 'duplicate model',
		explicit_details: {name: 'User'}
	}
];

describe('error types', function () {
	describe('default error contract', function () {
		for(const error_case of error_cases) {
			test(error_case.ErrorType.name + ' applies defaults and serializes response payload', function () {
				const error_instance = new error_case.ErrorType();

				expect(error_instance instanceof Error).toBe(true);
				expect(error_instance.constructor).toBe(error_case.ErrorType);
				expect(error_instance.name).toBe(error_case.type);
				expect(error_instance.message).toBe(error_case.default_message);
				expect(error_instance.details).toBe(null);
				expect(error_instance.to_json()).toEqual({
					success: false,
					error: {
						type: error_case.type,
						message: error_case.default_message,
						details: null
					}
				});
			});
		}
	});

	describe('explicit message and details', function () {
		for(const error_case of error_cases) {
			test(error_case.ErrorType.name + ' preserves explicit message and details', function () {
				const error_instance = new error_case.ErrorType(
					error_case.explicit_message,
					error_case.explicit_details
				);

				expect(error_instance instanceof Error).toBe(true);
				expect(error_instance.constructor).toBe(error_case.ErrorType);
				expect(error_instance.message).toBe(error_case.explicit_message);
				expect(error_instance.details).toBe(error_case.explicit_details);
				expect(error_instance.to_json().error).toEqual({
					type: error_case.type,
					message: error_case.explicit_message,
					details: error_case.explicit_details
				});
			});
		}
	});
});
