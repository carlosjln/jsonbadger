import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const sql_runner_mock = jest.fn();

jest.unstable_mockModule('#src/sql/run.js', function () {
	return {
		default: sql_runner_mock
	};
});

const {default: Schema} = await import('#src/schema/schema.js');
const {default: model} = await import('#src/model/factory/index.js');

describe('Model persistence operations lifecycle', function () {
	let connection;

	beforeEach(function () {
		sql_runner_mock.mockReset();
		connection = {
			pool_instance: {query: jest.fn()},
			options: {debug: false}
		};
	});

	test('insert_one persists plain input through the insert path and returns a hydrated instance', async function () {
		sql_runner_mock.mockResolvedValueOnce({
			rows: [{
				id: '11',
				data: {name: 'saved'},
				created_at: new Date('2026-03-06T10:00:00.000Z'),
				updated_at: new Date('2026-03-06T11:00:00.000Z')
			}]
		});

		const User = create_model(new Schema({name: String}), connection);
		const saved_document = await User.insert_one({name: 'saved'});

		expect(saved_document).toBeInstanceOf(User);
		expect(saved_document.is_new).toBe(false);
		expect(saved_document.document.data).toEqual({name: 'saved'});
		expect(saved_document.document.$has_changes()).toBe(false);
		expect(sql_runner_mock).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO "users"'), expect.any(Array), connection);
	});

	test('insert_one preserves explicit timestamps and includes uuid ids for uuidv7 models', async function () {
		const created_at = new Date('2026-03-06T10:00:00.000Z');
		const updated_at = new Date('2026-03-06T11:00:00.000Z');

		sql_runner_mock.mockResolvedValueOnce({
			rows: [{
				id: '019631f7-ef80-7c17-8cf0-a9b241551111',
				data: {name: 'saved'},
				created_at,
				updated_at
			}]
		});

		const User = create_model(new Schema({name: String}, {
			id_strategy: 'uuidv7'
		}), connection);
		const user_document = User.from({
			id: '019631f7-ef80-7c17-8cf0-a9b241551111',
			name: 'saved',
			created_at,
			updated_at
		});

		await User.insert_one(user_document);

		expect(sql_runner_mock.mock.calls[0][0]).toContain('INSERT INTO "users" ("data", id, created_at, updated_at)');
		expect(sql_runner_mock.mock.calls[0][1]).toEqual([
			'{"name":"saved"}',
			'019631f7-ef80-7c17-8cf0-a9b241551111',
			created_at,
			updated_at
		]);
	});

	test('update_one normalizes public dotted input into the JSONB update path and hydrates the returned row', async function () {
		sql_runner_mock.mockResolvedValueOnce({
			rows: [{
				id: '12',
				data: {
					profile: {
						city: 'Madrid'
					}
				},
				created_at: new Date('2026-03-06T10:00:00.000Z'),
				updated_at: new Date('2026-03-06T11:00:00.000Z')
			}]
		});

		const User = create_model(new Schema({
			profile: {
				city: String
			}
		}), connection);

		const updated_document = await User.update_one({id: '12'}, {
			'profile.city': 'Madrid'
		});

		expect(updated_document).toBeInstanceOf(User);
		expect(updated_document.document.data).toEqual({
			profile: {
				city: 'Madrid'
			}
		});
		expect(sql_runner_mock.mock.calls[0][0]).toContain('jsonb_set');
		expect(sql_runner_mock.mock.calls[0][1]).toEqual(expect.arrayContaining(['"Madrid"', '12']));
	});

	test('update_one returns null immediately when the update definition is empty', async function () {
		const User = create_model(new Schema({name: String}), connection);
		const result = await User.update_one({id: '12'}, {});

		expect(result).toBeNull();
		expect(sql_runner_mock).not.toHaveBeenCalled();
	});

	test('update_one accepts tracker delta input and strips the tracked root from set and unset paths', async function () {
		sql_runner_mock.mockResolvedValueOnce({rows: []});

		const User = create_model(new Schema({name: String}), connection);

		const result = await User.update_one({id: '21'}, {
			set: {
				'data.name': 'bob'
			},
			unset: ['data.old_value'],
			replace_roots: {}
		});

		expect(result).toBeNull();
		expect(sql_runner_mock.mock.calls[0][0]).toContain('jsonb_set');
		expect(sql_runner_mock.mock.calls[0][0]).toContain('#-');
		expect(sql_runner_mock.mock.calls[0][1]).toEqual(expect.arrayContaining(['"bob"', '21']));
	});

	test('delete_one returns null when no row matches and hydrates the deleted row when one exists', async function () {
		const User = create_model(new Schema({name: String}), connection);

		sql_runner_mock.mockResolvedValueOnce({rows: []});
		const missing_document = await User.delete_one({name: 'missing'});
		expect(missing_document).toBeNull();

		sql_runner_mock.mockResolvedValueOnce({
			rows: [{
				id: '13',
				data: {name: 'deleted'},
				created_at: new Date('2026-03-06T10:00:00.000Z'),
				updated_at: new Date('2026-03-06T11:00:00.000Z')
			}]
		});

		const deleted_document = await User.delete_one({name: 'deleted'});

		expect(deleted_document).toBeInstanceOf(User);
		expect(deleted_document.document.data).toEqual({name: 'deleted'});
		expect(sql_runner_mock.mock.calls[1][0]).toContain('DELETE FROM "users" AS target_table');
	});

	test('delete_one supports an empty filter and forwards the compiled connection', async function () {
		sql_runner_mock.mockResolvedValueOnce({rows: []});

		const User = create_model(new Schema({name: String}), connection);
		const deleted_document = await User.delete_one();

		expect(deleted_document).toBeNull();
		expect(sql_runner_mock).toHaveBeenCalledWith(expect.stringContaining('WHERE TRUE LIMIT 1'), expect.any(Array), connection);
		expect(sql_runner_mock.mock.calls[0][1]).toEqual([]);
	});
});

function create_model(schema_instance, connection) {
	return model('User', schema_instance, {
		table_name: 'users'
	}, connection);
}
