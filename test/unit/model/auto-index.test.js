import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const ensure_table_mock = jest.fn();
const ensure_index_mock = jest.fn();
const ensure_schema_mock = jest.fn();
const connection_options_state = {
	id_strategy: 'bigserial',
	auto_index: true
};

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

jest.unstable_mockModule('#src/connection/pool-store.js', function build_pool_store_mock() {
	const query_stub = jest.fn();

	return {
		get_connection_options: function () {
			return connection_options_state;
		},

		get_server_capabilities: function () {
			return {supports_uuidv7: true};
		},

		get_debug_mode: function () {
			return false;
		},

		get_pool: function () {
			return {
				query: query_stub
			};
		},

		has_pool: function () {
			return true;
		},

		set_pool: function () {
		},

		clear_pool: function () {
		}
	};
});

const {default: model} = await import('#src/model/model-factory.js');

describe('Model auto index behavior', function () {
	beforeEach(function reset_test_state() {
		ensure_table_mock.mockReset();
		ensure_index_mock.mockReset();
		ensure_schema_mock.mockReset();

		ensure_table_mock.mockResolvedValue(undefined);
		ensure_index_mock.mockResolvedValue(undefined);
		ensure_schema_mock.mockResolvedValue(undefined);

		connection_options_state.id_strategy = 'bigserial';
		connection_options_state.auto_index = true;
	});

	test('uses connection auto_index default when model auto_index is not set', async function () {
		const schema_instance = build_schema_instance([{index_spec: 'name', index_options: {}}]);
		const user_model = model(schema_instance, {
			table_name: 'users'
		});

		await user_model.ensure_table();

		expect(ensure_table_mock).toHaveBeenCalledWith('users', 'data', 'bigserial');
		expect(ensure_index_mock).toHaveBeenCalledWith('users', 'name', 'data', {});
	});

	test('model auto_index false overrides connection auto_index true', async function () {
		const schema_instance = build_schema_instance([{index_spec: 'name', index_options: {}}]);
		const user_model = model(schema_instance, {
			table_name: 'users',
			auto_index: false
		});

		await user_model.ensure_table();

		expect(ensure_table_mock).toHaveBeenCalledWith('users', 'data', 'bigserial');
		expect(ensure_index_mock).not.toHaveBeenCalled();
	});

	test('model auto_index true overrides connection auto_index false', async function () {
		connection_options_state.auto_index = false;

		const schema_instance = build_schema_instance([{index_spec: 'name', index_options: {}}]);
		const user_model = model(schema_instance, {
			table_name: 'users',
			auto_index: true
		});

		await user_model.ensure_table();

		expect(ensure_table_mock).toHaveBeenCalledWith('users', 'data', 'bigserial');
		expect(ensure_index_mock).toHaveBeenCalledWith('users', 'name', 'data', {});
	});

	test('only applies auto_index once per model instance', async function () {
		const schema_instance = build_schema_instance([{index_spec: 'name', index_options: {}}]);
		const user_model = model(schema_instance, {
			table_name: 'users'
		});

		await user_model.ensure_table();
		await user_model.ensure_table();

		expect(ensure_index_mock).toHaveBeenCalledTimes(1);
	});
});

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
