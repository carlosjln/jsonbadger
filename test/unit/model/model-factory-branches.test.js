import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const ensure_table_mock = jest.fn();
const ensure_index_mock = jest.fn();
const ensure_schema_mock = jest.fn();
const sql_runner_mock = jest.fn();
const connection_options_state = {
	id_strategy: 'bigserial',
	auto_index: false
};
let has_pool_state = false;

jest.unstable_mockModule('#src/migration/ensure-table.js', function () {
	return {
		default: ensure_table_mock
	};
});

jest.unstable_mockModule('#src/migration/ensure-index.js', function () {
	return {
		default: ensure_index_mock
	};
});

jest.unstable_mockModule('#src/migration/ensure-schema.js', function () {
	return {
		default: ensure_schema_mock
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

		get_server_capabilities: function () {
			return null;
		},

		has_pool: function () {
			return has_pool_state;
		}
	};
});

const {default: QueryBuilder} = await import('#src/query/query-builder.js');
const {default: QueryError} = await import('#src/errors/query-error.js');
const {default: Schema} = await import('#src/schema/schema.js');
const {default: model} = await import('#src/model/model-factory.js');

describe('model-factory branch behavior', function () {
	beforeEach(function () {
		ensure_table_mock.mockReset();
		ensure_index_mock.mockReset();
		ensure_schema_mock.mockReset();
		sql_runner_mock.mockReset();

		ensure_table_mock.mockResolvedValue(undefined);
		ensure_index_mock.mockResolvedValue(undefined);
		ensure_schema_mock.mockResolvedValue(undefined);
		sql_runner_mock.mockResolvedValue({rows: [{data: {ok: true}}]});

		connection_options_state.id_strategy = 'bigserial';
		connection_options_state.auto_index = false;
		has_pool_state = false;
	});

	test('creates default document data and returns QueryBuilder instances for read methods', function () {
		const schema_instance = build_schema_stub([]);
		const user_model = model(schema_instance, {table_name: 'users'});
		const doc = new user_model();
		const find_query = user_model.find();
		const find_one_query = user_model.find_one();
		const count_query = user_model.count_documents();

		expect(doc.data).toEqual({});
		expect(find_query).toBeInstanceOf(QueryBuilder);
		expect(find_one_query).toBeInstanceOf(QueryBuilder);
		expect(count_query).toBeInstanceOf(QueryBuilder);
		expect(find_query.operation_name).toBe('find');
		expect(find_one_query.operation_name).toBe('find_one');
		expect(count_query.operation_name).toBe('count_documents');
	});

	test('resolve_id_strategy uses model override and falls back to connection default', function () {
		connection_options_state.id_strategy = 'uuidv7';

		const override_model = model(build_schema_stub([]), {
			table_name: 'override_users',
			id_strategy: 'bigserial'
		});

		const fallback_model = model(build_schema_stub([]), {
			table_name: 'fallback_users'
		});

		expect(override_model.resolve_id_strategy()).toBe('bigserial');
		expect(fallback_model.resolve_id_strategy()).toBe('uuidv7');
	});

	test('ensure_index creates table and applies schema indexes even when uuidv7 is selected without a pool', async function () {
		connection_options_state.id_strategy = 'uuidv7';

		const schema_instance = build_schema_stub([
			{index_spec: 'name', index_options: {}}
		]);

		const user_model = model(schema_instance, {table_name: 'users'});

		await user_model.ensure_index();

		expect(ensure_table_mock).toHaveBeenCalledWith('users', 'data', 'uuidv7');
		expect(ensure_index_mock).toHaveBeenCalledWith('users', 'name', 'data', {});
	});

	test('update_one returns null when no row matches and accepts null query_filter', async function () {
		sql_runner_mock.mockResolvedValueOnce({rows: []});
		const user_model = model(new Schema({active: Boolean}), {table_name: 'users'});

		const result = await user_model.update_one(null, {
			$set: {
				active: true
			}
		});

		expect(result).toBeNull();
		expect(sql_runner_mock.mock.calls[0][0]).toContain('WHERE TRUE');
	});

	test('update_one skips schema path casting when schema.path is unavailable', async function () {
		const schema_without_path = build_schema_stub([]);
		const user_model = model(schema_without_path, {table_name: 'users'});

		await user_model.update_one({}, {
			$set: {
				payload: {ok: true}
			}
		});

		expect(sql_runner_mock).toHaveBeenCalledTimes(1);
		expect(sql_runner_mock.mock.calls[0][1]).toEqual(['{"ok":true}']);
	});

	test('update_one rejects missing supported operators', async function () {
		const user_model = model(new Schema({name: String}), {table_name: 'users'});

		await expect(user_model.update_one({}, undefined)).rejects.toThrow('update_one requires at least one supported update operator');
		expect(ensure_table_mock).not.toHaveBeenCalled();
	});

	test('update_one rejects invalid operator payload types', async function () {
		const user_model = model(new Schema({name: String}), {table_name: 'users'});

		await expect(user_model.update_one({}, {$set: 1})).rejects.toThrow('update_definition.$set must be an object');
		await expect(user_model.update_one({}, {$insert: 1})).rejects.toThrow('update_definition.$insert must be an object');
		await expect(user_model.update_one({}, {$set_lax: 1})).rejects.toThrow('update_definition.$set_lax must be an object');
	});

	test('update_one rejects exact duplicate update paths across operators', async function () {
		const user_model = model(new Schema({payload: {}}), {table_name: 'users'});

		await expect(user_model.update_one({}, {
			$set: {
				'payload.value': 'a'
			},
			$insert: {
				'payload.value': 'b'
			}
		})).rejects.toThrow('Conflicting update paths');
	});

	test('update_one rejects invalid update path formats', async function () {
		const user_model = model(new Schema({payload: {}}), {table_name: 'users'});

		await expect(user_model.update_one({}, {
			$set: {
				'payload..value': 1
			}
		})).rejects.toThrow('Update path contains an empty segment');

		await expect(user_model.update_one({}, {
			$set: {
				'1payload.value': 1
			}
		})).rejects.toThrow('Update path root segment has invalid characters');

		await expect(user_model.update_one({}, {
			$set: {
				'payload.bad-seg': 1
			}
		})).rejects.toThrow('Update path contains an invalid nested segment');
	});

	test('delete_one rethrows non-QueryError failures', async function () {
		const user_model = model(new Schema({name: String}), {table_name: 'users'});
		sql_runner_mock.mockRejectedValueOnce(new Error('db down'));

		await expect(user_model.delete_one({name: 'a'})).rejects.toThrow('db down');
	});

	test('delete_one rethrows QueryError when cause is not a string', async function () {
		const user_model = model(new Schema({name: String}), {table_name: 'users'});

		sql_runner_mock.mockRejectedValueOnce(new QueryError('SQL execution failed', {
			cause: {message: 'not string'}
		}));

		await expect(user_model.delete_one({name: 'a'})).rejects.toThrow('SQL execution failed');
	});
});

function build_schema_stub(indexes) {
	return {
		validate: function (input_payload) {
			return input_payload;
		},
		get_indexes: function () {
			return indexes;
		}
	};
}

