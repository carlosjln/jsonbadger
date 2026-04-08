import {describe, expect, test} from '@jest/globals';

import {
	create_payload_model,
	create_stubbed_model
} from '#test/unit/model/test-helpers.js';

describe('Model construction lifecycle', function () {
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
				id: '7',
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

		test('documents current hydrate debt for primitive, null, and array input', function () {
			const User = create_stubbed_model({
				default_slug: 'payload'
			});

			expect(function hydrate_null() {
				User.hydrate(null);
			}).toThrow(TypeError);

			expect(function hydrate_primitive() {
				User.hydrate('alice');
			}).toThrow(TypeError);

			expect(function hydrate_array() {
				User.hydrate(['alice']);
			}).toThrow(TypeError);
		});

		test('documents current hydrate debt when serialization does not produce a plain row object', function () {
			const User = create_stubbed_model({
				default_slug: 'payload'
			});

			expect(function hydrate_broken_serializable_row() {
				User.hydrate(new BrokenSerializableRow());
			}).toThrow(TypeError);
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
