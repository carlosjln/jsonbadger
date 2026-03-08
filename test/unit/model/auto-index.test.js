import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const ensure_table_mock = jest.fn();
const ensure_index_mock = jest.fn();
const ensure_schema_mock = jest.fn();

jest.unstable_mockModule('#src/migration/ensure-table.js', function build_ensure_table_mock() {
	return {
		default: ensure_table_mock
	};
});

jest.unstable_mockModule('#src/migration/ensure-index.js', function build_ensure_index_mock() {
	return {
		default: ensure_index_mock
	};
});

jest.unstable_mockModule('#src/migration/ensure-schema.js', function build_ensure_schema_mock() {
	return {
		default: ensure_schema_mock
	};
});

function create_connection(conn_options = {}) {
	const default_connection_options = {
		id_strategy: 'bigserial',
		auto_index: true
	};
	const options = Object.assign({}, default_connection_options, conn_options);

	return {
		options,
		server_capabilities: {supports_uuidv7: true}
	};
}

function build_schema_instance(indexes) {
	return {
		validate: function (input_payload) {
			return input_payload;
		},
		get_indexes: function () {
			return indexes;
		}
	};
}

const {default: model} = await import('#src/model/model-factory.js');

describe('Model auto index behavior', function () {
	let connection;

	beforeEach(function reset_test_state() {
		ensure_table_mock.mockReset();
		ensure_index_mock.mockReset();
		ensure_schema_mock.mockReset();

		ensure_table_mock.mockResolvedValue(undefined);
		ensure_index_mock.mockResolvedValue(undefined);
		ensure_schema_mock.mockResolvedValue(undefined);
		connection = create_connection();
	});

	test('uses connection auto_index default when model auto_index is not set', async function () {
		const schema_instance = build_schema_instance([{using: 'gin', path: 'name'}]);
		const user_model = model(schema_instance, {table_name: 'users'}, connection, 'User');

		await user_model.ensure_table();

		expect(ensure_table_mock).toHaveBeenCalledWith('users', 'data', 'bigserial', connection);
		expect(ensure_index_mock).toHaveBeenCalledWith('users', {using: 'gin', path: 'name'}, 'data', connection);
	});

	test('model auto_index false overrides connection auto_index true', async function () {
		const schema_instance = build_schema_instance([{using: 'gin', path: 'name'}]);
		const user_model = model(schema_instance, {
			table_name: 'users',
			auto_index: false
		}, connection, 'User');

		await user_model.ensure_table();

		expect(ensure_table_mock).toHaveBeenCalledWith('users', 'data', 'bigserial', connection);
		expect(ensure_index_mock).not.toHaveBeenCalled();
	});

	test('model auto_index true overrides connection auto_index false', async function () {
		connection = create_connection({auto_index: false});

		const schema_instance = build_schema_instance([{using: 'gin', path: 'name'}]);
		const user_model = model(schema_instance, {
			table_name: 'users',
			auto_index: true
		}, connection, 'User');

		await user_model.ensure_table();

		expect(ensure_table_mock).toHaveBeenCalledWith('users', 'data', 'bigserial', connection);
		expect(ensure_index_mock).toHaveBeenCalledWith('users', {using: 'gin', path: 'name'}, 'data', connection);
	});

	test('only applies auto_index once per model instance', async function () {
		const schema_instance = build_schema_instance([{using: 'gin', path: 'name'}]);
		const user_model = model(schema_instance, {table_name: 'users'}, connection, 'User');

		await user_model.ensure_table();
		await user_model.ensure_table();

		expect(ensure_index_mock).toHaveBeenCalledTimes(1);
	});
});
