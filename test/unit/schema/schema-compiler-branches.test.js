import {describe, expect, test} from '@jest/globals';

import {
	prepare_schema_state,
	validate_payload
} from '#src/schema/schema-compiler.js';

describe('schema compiler helpers', function () {
	test('returns validation_error details for non-object payloads', function () {
		const prepared_schema_state = prepare_schema_state({name: String});
		const null_result = validate_payload(null, prepared_schema_state.sorted_paths, prepared_schema_state.field_types);
		const array_result = validate_payload([], prepared_schema_state.sorted_paths, prepared_schema_state.field_types);

		expect(null_result).toEqual({
			valid: false,
			errors: [
				{
					path: '',
					code: 'validation_error',
					message: 'Schema validation failed',
					type: 'object'
				}
			]
		});

		expect(array_result.errors[0].type).toBe('object');
	});

	test('prepares field types and sorts shallow paths before nested paths', function () {
		const prepared_schema_state = prepare_schema_state({
			name: String,
			profile: {
				city: String
			}
		});

		expect(Object.keys(prepared_schema_state.field_types)).toEqual([
			'name',
			'profile.city'
		]);
		expect(prepared_schema_state.sorted_paths).toEqual([
			'name',
			'profile.city'
		]);
		expect(prepared_schema_state.path_introspection.field_types).toBe(prepared_schema_state.field_types);
	});

	test('returns field validation details for invalid payloads and passes valid ones', function () {
		const prepared_schema_state = prepare_schema_state({
			name: {
				type: String,
				match: /^[a-z]+$/
			}
		});
		const invalid_result = validate_payload(
			{name: '123'},
			prepared_schema_state.sorted_paths,
			prepared_schema_state.field_types
		);
		const valid_result = validate_payload(
			{name: 'alice'},
			prepared_schema_state.sorted_paths,
			prepared_schema_state.field_types
		);

		expect(invalid_result).toEqual({
			valid: false,
			errors: [
				{
					path: 'name',
					code: 'validator_error',
					message: 'Path "name" does not match pattern',
					type: 'validator_error'
				}
			]
		});
		expect(valid_result).toEqual({
			valid: true,
			errors: null
		});
	});
});
