import {describe, expect, test} from '@jest/globals';

import {create_payload_model} from '#test/unit/model/test-helpers.js';

function create_hydrated_document(schema_definition, document_data, slugs = []) {
	const User = create_payload_model(schema_definition, slugs);
	return User.hydrate(document_data);
}

function bind_entity(document_value) {
	const entity = {};
	document_value.bind_document(entity);
	return entity;
}

function clear_bound_properties(target) {
	for(const field_name of Object.keys(target)) {
		delete target[field_name];
	}
}

describe('Model document binding lifecycle', function () {
	test('bind_document returns the target and exposes base fields, default-slug roots, and extra slugs', function () {
		const user_document = create_hydrated_document({
			email: String,
			profile: {
				name: String
			},
			settings: {
				theme: String
			}
		}, {
			id: '9',
			payload: {
				email: 'alice@example.com',
				profile: {
					name: 'alice'
				}
			},
			settings: {
				theme: 'dark'
			},
			created_at: '2026-04-05T08:00:00.000Z',
			updated_at: '2026-04-05T09:00:00.000Z'
		}, ['settings']);
		const entity = {};

		const result = user_document.bind_document(entity);

		expect(result).toBe(entity);
		expect(entity.id).toBe('9');
		expect(entity.created_at).toEqual(new Date('2026-04-05T08:00:00.000Z'));
		expect(entity.updated_at).toEqual(new Date('2026-04-05T09:00:00.000Z'));
		expect(entity.email).toBe('alice@example.com');
		expect(entity.profile).toBe(user_document.document.payload.profile);
		expect(entity.settings).toBe(user_document.document.settings);
	});

	test('bind_document routes default-slug writes through model set so field casts still apply', function () {
		const user_document = create_hydrated_document({
			age: Number
		}, {
			payload: {}
		});
		const entity = bind_entity(user_document);
		entity.age = '41';

		expect(user_document.document.payload.age).toBe(41);
		expect(user_document.document.$get_delta()).toEqual({
			replace_roots: {},
			set: {
				'payload.age': 41
			},
			unset: []
		});
	});

	test('bind_document exposes live nested default-slug objects', function () {
		const user_document = create_hydrated_document({
			profile: {
				name: String
			}
		}, {
			payload: {
				profile: {
					name: 'alice'
				}
			}
		});
		const entity = bind_entity(user_document);
		entity.profile.name = 'bob';

		expect(user_document.document.payload.profile.name).toBe('bob');
		expect(user_document.document.$get_delta()).toEqual({
			replace_roots: {},
			set: {
				'payload.profile.name': 'bob'
			},
			unset: []
		});
	});

	test('bind_document exposes live nested extra slugs', function () {
		const user_document = create_hydrated_document({
			settings: {
				theme: String
			}
		}, {
			payload: {},
			settings: {
				theme: 'dark'
			}
		}, ['settings']);
		const entity = bind_entity(user_document);
		entity.settings.theme = 'light';

		expect(user_document.document.settings.theme).toBe('light');
		expect(user_document.document.$get_delta()).toEqual({
			replace_roots: {},
			set: {
				'settings.theme': 'light'
			},
			unset: []
		});
	});

	test('bind_document throws on field collisions', function () {
		const user_document = create_hydrated_document({
			email: String
		}, {
			payload: {
				email: 'alice@example.com'
			}
		});
		const entity = {
			email: 'existing'
		};

		expect(function bind_with_collision() {
			user_document.bind_document(entity);
		}).toThrow('bind_document field collision: email');
	});

	test('bind_document can be rebound to another model instance after removing the old descriptors', function () {
		const first_document = create_hydrated_document({
			email: String,
			settings: {
				theme: String
			}
		}, {
			payload: {
				email: 'alice@example.com'
			},
			settings: {
				theme: 'dark'
			}
		}, ['settings']);
		const second_document = create_hydrated_document({
			email: String,
			settings: {
				theme: String
			}
		}, {
			payload: {
				email: 'bob@example.com'
			},
			settings: {
				theme: 'light'
			}
		}, ['settings']);
		const entity = bind_entity(first_document);

		clear_bound_properties(entity);
		second_document.bind_document(entity);
		entity.settings.theme = 'blue';

		expect(entity.email).toBe('bob@example.com');
		expect(second_document.document.settings.theme).toBe('blue');
		expect(first_document.document.settings.theme).toBe('dark');
	});
});
