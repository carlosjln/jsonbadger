import {describe, expect, test} from '@jest/globals';

import Schema from '#src/schema/schema.js';
import model from '#src/model/factory/index.js';
import {
	create_payload_model
} from '#test/unit/model/test-helpers.js';

const existing_uuid = '7';

describe('Model construction lifecycle', function () {
	describe('compiled schema lifecycle', function () {
		test('clones and binds the source schema during model compilation', function () {
			const schema_instance = new Schema({
				name: String
			});

			schema_instance.$runtime.identity = {
				mode: 'stale'
			};

			const User = model('User', schema_instance, {
				table_name: 'users'
			}, null);

			expect(User.schema).not.toBe(schema_instance);
			expect(User.schema.validators.base_fields).toEqual(expect.any(Function));
			expect(Object.getPrototypeOf(User.schema.$runtime)).toBeNull();
			expect(Object.keys(User.schema.$runtime)).toEqual(['read_operators', 'identity']);
			expect(User.schema.$runtime.identity).toEqual({
				type: 'bigint',
				format: null,
				mode: 'database',
				requires_explicit_id: false,
				column_sql: 'id BIGSERIAL PRIMARY KEY'
			});
			expect(schema_instance.$runtime.identity).toEqual({
				mode: 'stale'
			});
		});
	});

	describe('from', function () {
		test('accepts serializable instances, ignores unsafe keys, and keeps extra slug roots out of the default slug', function () {
			const User = create_payload_model({
				name: String,
				settings: {
					theme: String
				}
			}, ['settings']);
			const source = new SerializableInput();
			source.name = 'alice';
			source.settings = {theme: 'dark'};
			source.constructor = {polluted: true};
			source.prototype = {polluted: true};

			const user_document = User.from(source);

			expect(user_document.document.payload).toEqual({
				name: 'alice'
			});
			expect(user_document.document.settings).toEqual({
				theme: 'dark'
			});
			expect(Object.prototype.hasOwnProperty.call(user_document.document.payload, 'constructor')).toBe(false);
			expect(Object.prototype.hasOwnProperty.call(user_document.document.payload, 'prototype')).toBe(false);
		});

		test('falls back to an empty default slug when input cannot normalize into a plain object', function () {
			const User = create_payload_model({
				name: String
			});
			const user_document = User.from(new BrokenSerializableInput());

			expect(user_document.document.payload).toEqual({});
		});

		test('falls back to an empty default slug for primitive, null, and array input', function () {
			const User = create_payload_model({
				name: String
			});

			expect(User.from(null).document.payload).toEqual({});
			expect(User.from('alice').document.payload).toEqual({});
			expect(User.from(['alice']).document.payload).toEqual({});
		});

		test('routes payload fields into the configured default slug and extra slugs', function () {
			const User = create_payload_model({
				name: String,
				profile: {
					city: String
				},
				settings: {
					theme: String
				}
			}, ['settings']);

			const user_document = User.from({
				'profile.city': 'Miami',
				settings: {
					theme: 'dark'
				}
			});

			expect(user_document.is_new).toBe(true);
			expect(user_document.document.payload).toEqual({
				profile: {
					city: 'Miami'
				}
			});
			expect(user_document.document.settings).toEqual({
				theme: 'dark'
			});
		});

		test('applies schema defaults across the default slug and extra slugs during from()', function () {
			const User = create_payload_model({
				name: {
					type: String,
					default: 'anonymous'
				},
				profile: {
					city: {
						type: String,
						default: 'Miami'
					}
				},
				settings: {
					theme: {
						type: String,
						default: 'dark'
					}
				}
			}, ['settings']);

			const user_document = User.from({});

			expect(user_document.document.payload).toEqual({
				name: 'anonymous',
				profile: {
					city: 'Miami'
				}
			});
			expect(user_document.document.settings).toEqual({
				theme: 'dark'
			});
		});

		test('passes from lifecycle context into function defaults', function () {
			const observed_contexts = [];
			const User = create_payload_model({
				name: {
					type: String,
					default: function (context_value) {
						observed_contexts.push(context_value);
						return 'alice';
					}
				}
			});

			const user_document = User.from({});

			expect(user_document.document.payload.name).toBe('alice');
			expect(observed_contexts).toHaveLength(1);
			expect(observed_contexts[0].mode).toBe('from');
			expect(observed_contexts[0].path).toBe('name');
			expect(observed_contexts[0].model).toBe(user_document);
			expect(observed_contexts[0].document).toBe(user_document.document);
		});
	});

	describe('hydrate', function () {
		test('uses the configured default slug and ignores unregistered row roots', function () {
			const User = create_payload_model({
				name: String,
				settings: {
					theme: String
				},
				status: {
					flag: Boolean
				}
			}, ['settings', 'status']);

			const hydrated_document = User.hydrate({
				payload: {
					name: 'alice'
				},
				settings: {
					theme: 'dark'
				},
				rogue: {
					flag: true
				}
			});

			expect(hydrated_document.is_new).toBe(false);
			expect(hydrated_document.document.payload).toEqual({name: 'alice'});
			expect(hydrated_document.document.settings).toEqual({theme: 'dark'});
			expect(hydrated_document.document.status).toEqual({});
			expect(hydrated_document.document.rogue).toBeUndefined();
		});

		test('keeps row orientation and does not recover default payload from unrelated root fields', function () {
			const User = create_payload_model({
				name: String
			});

			const hydrated_document = User.hydrate({
				name: 'alice',
				data: {
					name: 'old'
				}
			});

			expect(hydrated_document.document.payload).toEqual({});
			expect(hydrated_document.document.name).toBeUndefined();
		});

		test('accepts serializable row objects and strips payload base fields', function () {
			const User = create_payload_model({
				name: String
			});
			const hydrated_document = User.hydrate(new SerializableRow({
				id: existing_uuid,
				payload: {
					name: 'alice',
					id: 'drop-me',
					created_at: 'drop-me-too',
					updated_at: 'drop-me-three'
				}
			}));

			expect(hydrated_document.document.payload).toEqual({
				name: 'alice'
			});
		});

		test('applies schema defaults across the default slug and extra slugs during hydrate()', function () {
			const User = create_payload_model({
				name: {
					type: String,
					default: 'anonymous'
				},
				profile: {
					city: {
						type: String,
						default: 'Miami'
					}
				},
				settings: {
					theme: {
						type: String,
						default: 'dark'
					}
				}
			}, ['settings']);

			const hydrated_document = User.hydrate({
				payload: {}
			});

			expect(hydrated_document.is_new).toBe(false);
			expect(hydrated_document.document.payload).toEqual({
				name: 'anonymous',
				profile: {
					city: 'Miami'
				}
			});
			expect(hydrated_document.document.settings).toEqual({
				theme: 'dark'
			});
		});

		test('passes hydrate lifecycle context into function defaults', function () {
			const observed_contexts = [];
			const User = create_payload_model({
				name: {
					type: String,
					default: function (context_value) {
						observed_contexts.push(context_value);
						return 'alice';
					}
				}
			});

			const hydrated_document = User.hydrate({
				payload: {}
			});

			expect(hydrated_document.document.payload.name).toBe('alice');
			expect(observed_contexts).toHaveLength(1);
			expect(observed_contexts[0].mode).toBe('hydrate');
			expect(observed_contexts[0].path).toBe('name');
			expect(observed_contexts[0].model).toBe(hydrated_document);
			expect(observed_contexts[0].document).toBe(hydrated_document.document);
		});

		test('falls back to an empty default slug for primitive, null, and array hydrate input', function () {
			const User = create_payload_model({
				name: String
			});

			expect(User.hydrate(null).document.payload).toEqual({});
			expect(User.hydrate('alice').document.payload).toEqual({});
			expect(User.hydrate(['alice']).document.payload).toEqual({});
		});

		test('falls back to an empty default slug when row serialization does not produce a plain object', function () {
			const User = create_payload_model({
				name: String
			});

			expect(User.hydrate(new BrokenSerializableRow()).document.payload).toEqual({});
		});
	});

	describe('low-level constructor', function () {
		test('does not apply schema lifecycle automatically when constructed directly', function () {
			const User = create_payload_model({
				name: {
					type: String,
					default: 'anonymous'
				},
				age: Number
			});

			const user_document = new User({
				payload: {
					age: '41'
				}
			});

			expect(user_document.is_new).toBe(true);
			expect(user_document.document.payload).toEqual({
				age: '41'
			});
			expect(user_document.document.payload.name).toBeUndefined();
		});

		test('allows manual lifecycle methods to apply defaults, cast, and validate after direct construction', function () {
			const User = create_payload_model({
				name: {
					type: String,
					default: 'anonymous'
				},
				age: Number
			});

			const user_document = new User({
				payload: {
					age: '41'
				}
			});

			user_document.$apply_defaults({mode: 'from'});

			expect(user_document.document.payload).toEqual({
				name: 'anonymous',
				age: '41'
			});

			user_document.$cast({mode: 'from'});

			expect(user_document.document.payload).toEqual({
				name: 'anonymous',
				age: 41
			});

			expect(function validate_document() {
				user_document.$validate({mode: 'from'});
			}).not.toThrow();
		});
	});

	describe('cast', function () {
		test('delegates to schema.cast(...) as a thin model-level alias', function () {
			const User = create_payload_model({
				age: Number,
				settings: {
					count: Number
				}
			}, ['settings']);

			expect(User.cast({
				payload: {
					age: '41'
				},
				settings: {
					count: '7'
				}
			})).toEqual({
				payload: {
					age: 41
				},
				settings: {
					count: 7
				}
			});
		});
	});
});

function SerializableInput() {}

SerializableInput.prototype.toJSON = function () {
	return {
		name: this.name,
		settings: this.settings,
		constructor: this.constructor,
		prototype: this.prototype
	};
};

function BrokenSerializableInput() {}

BrokenSerializableInput.prototype.toJSON = function () {
	return 'not-a-plain-object';
};

function SerializableRow(row_value) {
	this.row_value = row_value;
}

SerializableRow.prototype.toJSON = function () {
	return this.row_value;
};

function BrokenSerializableRow() {}

BrokenSerializableRow.prototype.toJSON = function () {
	return 'not-a-plain-object';
};
