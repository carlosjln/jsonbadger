import {describe, expect, test} from '@jest/globals';

import {create_model} from '#test/unit/model/test-helpers.js';

describe('Model tracking lifecycle', function () {
	test('constructor tracks both the default slug and registered extra slugs', function () {
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
			payload: {
				name: 'alice'
			},
			settings: {
				theme: 'dark'
			}
		});

		user_document.document.payload.name = 'bob';
		user_document.document.settings.theme = 'light';

		expect(user_document.document.$get_delta()).toEqual({
			replace_roots: {},
			set: {
				'payload.name': 'bob',
				'settings.theme': 'light'
			},
			unset: []
		});
	});
});
