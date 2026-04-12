import {describe, expect, test} from '@jest/globals';

import Schema from '#src/schema/schema.js';
import ValidationError from '#src/errors/validation-error.js';

describe('Schema validation lifecycle', function () {
	test('validates one full document envelope across the default slug and extra slugs', function () {
		const schema_instance = new Schema({
			name: String,
			settings: {
				theme: String
			}
		}, {
			default_slug: 'payload',
			slugs: ['settings']
		});

		expect(function validate_document() {
			schema_instance.validate({
				payload: {
					name: 'alice'
				},
				settings: {
					theme: 'dark'
				}
			});
		}).not.toThrow();
	});

	test('fails fast when a registered slug is defined as a direct field instead of a root object', function () {
		expect(function build_invalid_schema() {
			return new Schema({
				settings: String
			}, {
				slugs: ['settings']
			});
		}).toThrow('Registered slug "settings" must be defined as a root object in schema');
	});

	test('validate rejects invalid extra-slug slice values', function () {
		const schema_instance = new Schema({
			name: String,
			settings: {
				theme: String
			}
		}, {
			default_slug: 'payload',
			slugs: ['settings']
		});

		expect(function validate_invalid_registered_slug() {
			schema_instance.validate({
				payload: {
					name: 'alice'
				},
				settings: 'dark'
			});
		}).toThrow('Schema validation failed');
	});

	test('conform strips unknown keys from the full document envelope using the compiled schema tree', function () {
		const schema_instance = new Schema({
			name: String,
			profile: {
				city: String
			}
		});
		const document = {
			data: {
				name: 'alice',
				profile: {
					city: 'Madrid',
					age: 32
				},
				role: 'admin'
			},
			debug: true
		};

		expect(schema_instance.conform(document)).toBe(document);
		expect(document).toEqual({
			data: {
				name: 'alice',
				profile: {
					city: 'Madrid'
				}
			}
		});
	});

	test('cast returns a cloned document envelope with base fields and slug slices casted', function () {
		const schema_instance = new Schema({
			age: Number,
			settings: {
				count: Number,
				theme: {
					type: String,
					set: function (value) {
						return String(value).trim();
					}
				}
			}
		}, {
			default_slug: 'payload',
			slugs: ['settings']
		});
		const source_document = {
			payload: {
				age: '41'
			},
			settings: {
				count: '7',
				theme: '  dark  '
			},
			updated_at: '2026-04-01T10:00:00.000Z'
		};
		const casted_document = schema_instance.cast(source_document);

		expect(casted_document).not.toBe(source_document);
		expect(casted_document.payload).toEqual({
			age: 41
		});
		expect(casted_document.settings).toEqual({
			count: 7,
			theme: 'dark'
		});
		expect(casted_document.updated_at).toBeInstanceOf(Date);
		expect(casted_document.updated_at.toISOString()).toBe('2026-04-01T10:00:00.000Z');
		expect(source_document).toEqual({
			payload: {
				age: '41'
			},
			settings: {
				count: '7',
				theme: '  dark  '
			},
			updated_at: '2026-04-01T10:00:00.000Z'
		});
	});

	test('cast returns non-plain input unchanged', function () {
		const schema_instance = new Schema({
			name: String
		});

		expect(schema_instance.cast(null)).toBeNull();
		expect(schema_instance.cast('alice')).toBe('alice');
	});

	test('validate_base_fields returns a valid result for supported root values', function () {
		const schema_instance = new Schema({
			name: String
		}, {
			id_strategy: 'uuidv7'
		});
		const validation_result = schema_instance.validate_base_fields({
			id: '019631f7-ef80-7c17-8cf0-a9b241551111',
			created_at: new Date('2026-03-31T10:00:00.000Z'),
			updated_at: '2026-03-31T11:00:00.000Z'
		});

		expect(validation_result).toEqual({
			valid: true,
			errors: null
		});
	});

	test('validate_base_fields throws detailed validation errors for invalid uuidv7 and timestamps', function () {
		const schema_instance = new Schema({
			name: String
		}, {
			identity: {
				type: 'uuid',
				format: 'uuidv7',
				mode: 'fallback'
			}
		});

		expect(function validate_invalid_base_fields() {
			schema_instance.validate_base_fields({
				id: 'not-a-uuidv7',
				created_at: 'bad-date',
				updated_at: 'still-bad'
			});
		}).toThrow(ValidationError);

		expect(function validate_invalid_base_fields_with_message() {
			schema_instance.validate_base_fields({
				id: 'not-a-uuidv7',
				created_at: 'bad-date',
				updated_at: 'still-bad'
			});
		}).toThrow('Schema validation failed');

		try {
			schema_instance.validate_base_fields({
				id: 'not-a-uuidv7',
				created_at: 'bad-date',
				updated_at: 'still-bad'
			});
		} catch(error) {
			expect(error.details).toEqual([
				{
					path: 'id',
					code: 'validator_error',
					message: 'Path "id" must be a valid UUIDv7',
					type: 'validator_error',
					value: 'not-a-uuidv7'
				},
				{
					path: 'created_at',
					code: 'validator_error',
					message: 'Path "created_at" must be a valid timestamp',
					type: 'validator_error',
					value: 'bad-date'
				},
				{
					path: 'updated_at',
					code: 'validator_error',
					message: 'Path "updated_at" must be a valid timestamp',
					type: 'validator_error',
					value: 'still-bad'
				}
			]);
		}
	});

	test('conform leaves non-object input unchanged and returns early for defensive non-object conform trees', function () {
		const schema_instance = new Schema({
			name: String
		});
		const document = {
			data: {
				name: 'alice',
				role: 'admin'
			}
		};

		expect(schema_instance.conform(null)).toBeNull();
		expect(schema_instance.conform('alice')).toBe('alice');
		expect(schema_instance.conform(['alice'])).toEqual(['alice']);

		schema_instance.$conform_tree = null;
		expect(schema_instance.conform(document)).toBe(document);
		expect(document).toEqual({
			data: {
				name: 'alice',
				role: 'admin'
			}
		});
	});
});
