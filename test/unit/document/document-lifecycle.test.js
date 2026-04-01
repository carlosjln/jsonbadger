import {describe, expect, test} from '@jest/globals';

import Document from '#src/model/document.js';

describe('Document lifecycle', function () {
	test('constructor copies normalized root state onto the document instance', function () {
		const document = new Document({
			id: '9',
			payload: {
				name: 'alice'
			},
			settings: {
				theme: 'dark'
			},
			created_at: '2026-03-03T08:00:00.000Z',
			updated_at: '2026-03-03T09:00:00.000Z'
		});

		expect(document.id).toBe('9');
		expect(document.payload).toEqual({name: 'alice'});
		expect(document.settings).toEqual({theme: 'dark'});
		expect(document.created_at).toBe('2026-03-03T08:00:00.000Z');
		expect(document.updated_at).toBe('2026-03-03T09:00:00.000Z');
	});

	test('init applies replacement state and returns the same document', function () {
		const document = new Document({
			payload: {name: 'alice'}
		});

		const result = document.init({
			payload: {name: 'bob'},
			settings: {theme: 'light'}
		});

		expect(result).toBe(document);
		expect(document.payload).toEqual({name: 'bob'});
		expect(document.settings).toEqual({theme: 'light'});
	});

	test('get reads exact root and nested paths from the document state', function () {
		const document = new Document({
			payload: {
				profile: {
					city: 'Miami'
				}
			},
			settings: {
				theme: 'dark'
			}
		});

		expect(document.get('payload')).toEqual({
			profile: {city: 'Miami'}
		});
		expect(document.get('payload.profile.city')).toBe('Miami');
		expect(document.get('settings.theme')).toBe('dark');
		expect(document.get('settings.missing')).toBeUndefined();
	});

	test('set writes exact root and nested paths and returns the same document', function () {
		const document = new Document({});

		const result = document
			.set('payload.profile.city', 'Madrid')
			.set('settings.theme', 'dark');

		expect(result).toBe(document);
		expect(document.payload).toEqual({
			profile: {
				city: 'Madrid'
			}
		});
		expect(document.settings).toEqual({
			theme: 'dark'
		});
	});
});
