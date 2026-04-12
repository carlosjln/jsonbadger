import {describe, expect, jest, test} from '@jest/globals';

import Document from '#src/model/document.js';
import {create_model} from '#test/unit/model/test-helpers.js';

const existing_uuid = '7';
const updated_uuid = '8';

describe('Model save lifecycle', function () {
	test('insert delegates to the compiled model insert_one path', async function () {
		const connection = {
			pool_instance: {
				query: jest.fn().mockResolvedValue({
					rows: [{
						id: updated_uuid,
						data: {
							name: 'alice'
						},
						created_at: new Date('2026-03-03T08:00:00.000Z'),
						updated_at: new Date('2026-03-03T09:00:00.000Z')
					}]
				})
			},
			options: {debug: false}
		};
		const User = create_model({
			name: String
		}, {}, {}, connection);
		const user_document = User.from({
			name: 'alice'
		});
		const insert_one_spy = jest.spyOn(User, 'insert_one');

		const inserted_document = await user_document.insert();

		expect(inserted_document).toBe(user_document);
		expect(insert_one_spy).not.toHaveBeenCalled();
		expect(connection.pool_instance.query).toHaveBeenCalledTimes(1);
		expect(user_document.is_new).toBe(false);
		expect(user_document.document.$has_changes()).toBe(false);
		expect(user_document.document.data).toEqual({
			name: 'alice'
		});
	});

	test('save on a new document delegates to insert()', async function () {
		const User = create_model({
			name: String
		});
		const user_document = User.from({
			name: 'alice'
		});
		const insert_spy = jest.spyOn(user_document, 'insert').mockResolvedValue(user_document);

		const saved_document = await user_document.save();

		expect(saved_document).toBe(user_document);
		expect(insert_spy).toHaveBeenCalledTimes(1);
	});

	test('save on a persisted document delegates to update()', async function () {
		const User = create_model({
			name: String
		});
		const user_document = User.hydrate({
			data: {
				name: 'alice'
			}
		});
		const update_spy = jest.spyOn(user_document, 'update').mockResolvedValue(user_document);

		const saved_document = await user_document.save();

		expect(saved_document).toBe(user_document);
		expect(update_spy).toHaveBeenCalledTimes(1);
	});

	test('update applies a new updated_at value and rebases from the raw updated row path', async function () {
		const connection = {
			pool_instance: {
				query: jest.fn().mockResolvedValue({
					rows: [{
						id: '7',
						data: {
							name: 'bob'
						},
						created_at: new Date('2026-03-03T07:00:00.000Z'),
						updated_at: new Date('2026-03-03T09:00:00.000Z')
					}]
				})
			},
			options: {debug: false}
		};
		const User = create_model({
			name: String
		}, {}, {}, connection);
		const user_document = User.hydrate({
			id: existing_uuid,
			data: {
				name: 'alice'
			},
			updated_at: new Date('2026-03-03T08:00:00.000Z')
		});
		const update_one_spy = jest.spyOn(User, 'update_one');
		const rebase_spy = jest.spyOn(user_document, 'rebase');

		user_document.set('data.name', 'bob');

		const updated_document = await user_document.update();

		expect(updated_document).toBe(user_document);
		expect(update_one_spy).not.toHaveBeenCalled();
		expect(rebase_spy).toHaveBeenCalledTimes(1);
		expect(rebase_spy).toHaveBeenCalledWith(expect.any(Document));
		expect(connection.pool_instance.query).toHaveBeenCalledTimes(1);
		expect(user_document.document.$has_changes()).toBe(false);
		expect(user_document.document.data).toEqual({
			name: 'bob'
		});
	});

	test('update requires a document id for persisted save operations', async function () {
		const User = create_model({
			name: String
		});
		const user_document = User.hydrate({
			data: {
				name: 'alice'
			}
		});

		user_document.set('data.name', 'bob');

		await expect(user_document.update()).rejects.toThrow('Document id is required for save update operations');
	});
});
