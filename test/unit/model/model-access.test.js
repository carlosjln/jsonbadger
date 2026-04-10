import {describe, expect, test} from '@jest/globals';

import {create_model} from '#test/unit/model/test-helpers.js';

const existing_uuid = '0194f028-579a-7b5b-8107-b9ad31395f43';
const next_uuid = '0194f028-579a-7b5b-8107-b9ad31395f44';

describe('Model access lifecycle', function () {
	test('dx aliases read and write the root document fields directly', function () {
		const User = create_model({
			name: String
		});
		const user_document = User.hydrate({
			id: existing_uuid,
			data: {
				name: 'alice'
			},
			created_at: '2026-03-03T08:00:00.000Z',
			updated_at: '2026-03-03T09:00:00.000Z'
		});

		expect(user_document.id).toBe(existing_uuid);
		expect(user_document.created_at).toEqual(new Date('2026-03-03T08:00:00.000Z'));
		expect(user_document.updated_at).toEqual(new Date('2026-03-03T09:00:00.000Z'));
		expect(user_document.timestamps).toEqual({
			created_at: new Date('2026-03-03T08:00:00.000Z'),
			updated_at: new Date('2026-03-03T09:00:00.000Z')
		});

		user_document.id = next_uuid;
		user_document.created_at = '2026-03-04T08:00:00.000Z';
		user_document.updated_at = '2026-03-04T09:00:00.000Z';

		expect(user_document.document.id).toBe(next_uuid);
		expect(user_document.document.created_at).toBe('2026-03-04T08:00:00.000Z');
		expect(user_document.document.updated_at).toBe('2026-03-04T09:00:00.000Z');
	});

	test('get reads exact root and nested paths from the document state', function () {
		const User = create_model({
			name: String,
			settings: {
				theme: String
			}
		}, {
			default_slug: 'payload',
			slugs: ['settings']
		});

		const user_document = User.hydrate({
			id: existing_uuid,
			payload: {
				name: 'alice'
			},
			settings: {
				theme: 'dark'
			}
		});

		expect(user_document.get('id')).toBe(existing_uuid);
		expect(user_document.get('payload.name')).toBe('alice');
		expect(user_document.get('settings.theme')).toBe('dark');
		expect(user_document.get('missing')).toBeNull();
		expect(user_document.get('settings.missing')).toBeUndefined();
	});

	test('set writes explicit-root paths and keeps schema-aware mutation for registered slug fields', function () {
		const User = create_model({
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

		const user_document = User.hydrate({
			payload: {},
			settings: {}
		});

		const result = user_document
			.set('payload.age', '41')
			.set('settings.count', '41')
			.set('settings.theme', '  dark  ');

		expect(result).toBe(user_document);
		expect(user_document.document.payload).toEqual({
			age: 41
		});
		expect(user_document.document.settings).toEqual({
			count: 41,
			theme: 'dark'
		});
	});

	test('set keeps read-only id and top-level timestamp protections', function () {
		const User = create_model({
			name: String
		}, {
			default_slug: 'payload'
		});

		const user_document = User.hydrate({
			id: existing_uuid,
			payload: {
				name: 'alice'
			},
			created_at: '2026-03-03T08:00:00.000Z'
		});

		expect(function assign_id() {
			user_document.set('id', next_uuid);
		}).toThrow('Read-only base field cannot be assigned by path mutation');

		expect(function assign_nested_timestamp() {
			user_document.set('created_at.value', '2026-03-04T00:00:00.000Z');
		}).toThrow('Timestamp fields only support top-level paths');
	});

	test('set allows top-level timestamp assignments and returns the same instance', function () {
		const User = create_model({
			name: String
		});
		const user_document = User.hydrate({
			id: existing_uuid,
			data: {
				name: 'alice'
			},
			updated_at: '2026-03-03T09:00:00.000Z'
		});

		const result = user_document.set('updated_at', '2026-03-05T00:00:00.000Z');

		expect(result).toBe(user_document);
		expect(user_document.updated_at).toBeInstanceOf(Date);
		expect(user_document.updated_at.toISOString()).toBe('2026-03-05T00:00:00.000Z');
		expect(user_document.document.updated_at).toBeInstanceOf(Date);
		expect(user_document.document.updated_at.toISOString()).toBe('2026-03-05T00:00:00.000Z');
	});
});
