import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const ensure_table_mock = jest.fn();
const sql_runner_mock = jest.fn();

jest.unstable_mockModule('#src/migration/ensure-table.js', function () {
	return {
		default: ensure_table_mock
	};
});

jest.unstable_mockModule('#src/sql/run.js', function () {
	return {
		default: sql_runner_mock
	};
});

const {default: QueryError} = await import('#src/errors/query-error.js');
const {default: Schema} = await import('#src/schema/schema.js');
const {default: model} = await import('#src/model/factory/index.js');

describe('Model.delete_one', function () {
	beforeEach(function () {
		ensure_table_mock.mockReset();
		sql_runner_mock.mockReset();
		sql_runner_mock.mockResolvedValue({
			rows: [{
				id: '12',
				data: {user_name: 'john'},
				created_at: new Date('2026-02-27T10:00:00.000Z'),
				updated_at: new Date('2026-02-27T11:00:00.000Z')
			}]
		});
	});

	test('deletes one matching row and returns deleted data', async function () {
		const schema_instance = new Schema({
			active: Boolean,
			user_name: String
		});
		const user_model = model(schema_instance, {
			table_name: 'users'
		});

		const deleted_data = await user_model.delete_one({active: 'yes'});

		expect(deleted_data).toBeInstanceOf(user_model);
		expect(deleted_data.to_json()).toEqual({
			user_name: 'john',
			id: '12',
			created_at: '2026-02-27T10:00:00.000Z',
			updated_at: '2026-02-27T11:00:00.000Z'
		});
		expect(ensure_table_mock).not.toHaveBeenCalled();
		expect(sql_runner_mock).toHaveBeenCalledTimes(1);

		const sql_text = sql_runner_mock.mock.calls[0][0];
		const sql_params = sql_runner_mock.mock.calls[0][1];

		expect(sql_text).toContain('WITH target_row AS (SELECT id FROM "users" WHERE');
		expect(sql_text).toContain('DELETE FROM "users" AS target_table');
		expect(sql_text).toContain('USING target_row');
		expect(sql_text).toContain('RETURNING target_table.id::text AS id, target_table."data" AS data, target_table.created_at AS created_at, target_table.updated_at AS updated_at');
		expect(sql_params).toEqual(['true']);
	});

	test('returns null when no row matches', async function () {
		sql_runner_mock.mockResolvedValueOnce({rows: []});

		const schema_instance = new Schema({
			user_name: String
		});
		const user_model = model(schema_instance, {
			table_name: 'users'
		});

		const deleted_data = await user_model.delete_one({user_name: 'missing'});

		expect(deleted_data).toBeNull();
		expect(sql_runner_mock).toHaveBeenCalledTimes(1);
	});

	test('returns null when the table is missing', async function () {
		sql_runner_mock.mockRejectedValueOnce(new QueryError('SQL execution failed', {
			cause: 'relation "users" does not exist'
		}));

		const schema_instance = new Schema({
			user_name: String
		});
		const user_model = model(schema_instance, {
			table_name: 'users'
		});

		const deleted_data = await user_model.delete_one({user_name: 'john'});

		expect(deleted_data).toBeNull();
		expect(ensure_table_mock).not.toHaveBeenCalled();
	});

	test('supports empty filter and compiles WHERE TRUE', async function () {
		const schema_instance = new Schema({
			user_name: String
		});
		const user_model = model(schema_instance, {
			table_name: 'users'
		});

		await user_model.delete_one();

		const sql_text = sql_runner_mock.mock.calls[0][0];
		const sql_params = sql_runner_mock.mock.calls[0][1];

		expect(sql_text).toContain('WHERE TRUE LIMIT 1');
		expect(sql_params).toEqual([]);
	});

	test('document instance delete().exec() deletes by document id', async function () {
		const schema_instance = new Schema({
			user_name: String
		});
		const user_model = model(schema_instance, {
			table_name: 'users'
		});
		const document_instance = new user_model({
			id: '12',
			user_name: 'john'
		});

		const deleted_document = await document_instance.delete().exec();

		expect(deleted_document).toBeInstanceOf(user_model);
		expect(sql_runner_mock).toHaveBeenCalledTimes(1);
		expect(sql_runner_mock.mock.calls[0][0]).toContain('WHERE "id" = $1::bigint');
		expect(sql_runner_mock.mock.calls[0][1]).toEqual(['12']);
	});

	test('document instance delete().exec() rejects when id is missing', async function () {
		const schema_instance = new Schema({
			user_name: String
		});
		const user_model = model(schema_instance, {
			table_name: 'users'
		});
		const document_instance = new user_model({
			user_name: 'john'
		});

		await expect(document_instance.delete().exec()).rejects.toThrow('Document id is required for delete operations');
		expect(sql_runner_mock).not.toHaveBeenCalled();
	});

	test('forwards model-owned connection context through delete queries', async function () {
		const connection = {
			pool_instance: {query: jest.fn()},
			options: {
				debug: false,
				id_strategy: 'bigserial',
				auto_index: false
			}
		};
		const schema_instance = new Schema({
			user_name: String
		});
		const user_model = model(schema_instance, {table_name: 'users'}, connection, 'User');

		await user_model.delete_one({user_name: 'john'});

		expect(sql_runner_mock).toHaveBeenCalledWith(expect.any(String), expect.any(Array), connection);
	});
});
