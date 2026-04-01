import {describe, expect, test} from '@jest/globals';

import {
	create_path_validator,
	prepare_schema_state,
	sort_paths_by_depth,
	validate_payload
} from '#src/schema/schema-compiler.js';

describe('Schema compiler lifecycle', function () {
	test('returns object validation errors for non-object payloads', function () {
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

	test('sorts same-depth paths alphabetically when depths match', function () {
		expect(['profile.zip', 'profile.city'].sort(sort_paths_by_depth)).toEqual([
			'profile.city',
			'profile.zip'
		]);
	});

	test('create_path_validator validates valid payloads and forwards nested missing state', function () {
		const validate_name = create_validator_recorder();
		const validate_city = create_validator_recorder();
		const field_types = {
			name: {
				validate: validate_name.validate
			},
			'profile.city': {
				validate: validate_city.validate
			}
		};
		const validate_document = create_path_validator(field_types);
		const validation_result = validate_document({
			name: 'alice'
		});

		expect(validation_result).toEqual({
			valid: true,
			errors: null
		});
		expect(validate_name.calls).toEqual([
			{
				value: 'alice',
				context: {
					path: 'name',
					exists: true
				}
			}
		]);
		expect(validate_city.calls).toEqual([
			{
				value: undefined,
				context: {
					path: 'profile.city',
					exists: false
				}
			}
		]);
	});

	test('formats thrown field errors with explicit code and fallback defaults', function () {
		const coded_result = validate_payload({
			name: '123'
		}, ['name'], {
			name: {
				validate() {
					const error = new Error('Path "name" does not match pattern');
					error.code = 'validator_error';
					throw error;
				}
			}
		});
		const fallback_result = validate_payload({
			name: '123'
		}, ['name'], {
			name: {
				validate() {
					throw new Error();
				}
			}
		});

		expect(coded_result).toEqual({
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
		expect(fallback_result).toEqual({
			valid: false,
			errors: [
				{
					path: 'name',
					code: 'validation_error',
					message: 'Schema validation failed',
					type: 'validation_error'
				}
			]
		});
	});
});

function create_validator_recorder() {
	const recorder = {
		calls: [],
		validate(value, context) {
			recorder.calls.push({
				value,
				context
			});
		}
	};

	return recorder;
}
