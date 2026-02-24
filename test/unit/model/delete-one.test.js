import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const ensure_table_mock = jest.fn();
const sql_runner_mock = jest.fn();
const connection_options_state = {
	id_strategy: 'bigserial',
	auto_index: false
};

jest.unstable_mockModule('#src/migration/ensure-table.js', function () {
	return {
		default: ensure_table_mock
	};
});

jest.unstable_mockModule('#src/sql/sql-runner.js', function () {
	return {
		default: sql_runner_mock
	};
});

jest.unstable_mockModule('#src/connection/pool-store.js', function () {
	return {
		get_connection_options: function () {
			return connection_options_state;
		},

		has_pool: function () {
			return false;
		},

		get_server_capabilities: function () {
			return null;
		}
	};
});

const {default: QueryError} = await import('#src/errors/query-error.js');
const {default: Schema} = await import('#src/schema/schema.js');
const {default: model} = await import('#src/model/model-factory.js');

describe('Model.delete_one', function () {
	beforeEach(function () {
		ensure_table_mock.mockReset();
		sql_runner_mock.mockReset();
		sql_runner_mock.mockResolvedValue({rows: [{data: {user_name: 'john'}}]});
		connection_options_state.id_strategy = 'bigserial';
		connection_options_state.auto_index = false;
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

		expect(deleted_data).toEqual({user_name: 'john'});
		expect(ensure_table_mock).not.toHaveBeenCalled();
		expect(sql_runner_mock).toHaveBeenCalledTimes(1);

		const sql_text = sql_runner_mock.mock.calls[0][0];
		const sql_params = sql_runner_mock.mock.calls[0][1];

		expect(sql_text).toContain('WITH target_row AS (SELECT id FROM "users" WHERE');
		expect(sql_text).toContain('DELETE FROM "users" AS target_table');
		expect(sql_text).toContain('USING target_row');
		expect(sql_text).toContain('RETURNING target_table."data" AS data');
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
});
