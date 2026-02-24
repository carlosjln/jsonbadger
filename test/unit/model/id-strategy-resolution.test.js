import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const ensure_table_mock = jest.fn();
const ensure_schema_mock = jest.fn();
const connection_options_state = {
	id_strategy: 'bigserial',
	auto_index: true
};
const server_capabilities_state = {
	server_version: '18.0',
	server_version_num: 180000,
	supports_uuidv7: true
};

jest.unstable_mockModule('#src/migration/ensure-table.js', function build_ensure_table_mock() {
	return {
		default: ensure_table_mock
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
			return server_capabilities_state;
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

const {default: defaults} = await import('#src/constants/defaults.js');
const {default: model} = await import('#src/model/model-factory.js');

describe('ID strategy resolution', function () {
	beforeEach(function reset_test_state() {
		ensure_table_mock.mockReset();
		ensure_schema_mock.mockReset();
		ensure_schema_mock.mockResolvedValue(undefined);
		connection_options_state.id_strategy = defaults.connection_options.id_strategy;
		connection_options_state.auto_index = defaults.connection_options.auto_index;
		server_capabilities_state.server_version = '18.0';
		server_capabilities_state.server_version_num = 180000;
		server_capabilities_state.supports_uuidv7 = true;
	});

	test('requires model options object', function () {
		const schema_instance = build_schema_instance();

		expect(function create_model_without_options() {
			model(schema_instance);
		}).toThrow('model options are required');
	});

	test('requires model table_name', function () {
		const schema_instance = build_schema_instance();

		expect(function create_model_without_table_name() {
			model(schema_instance, {});
		}).toThrow('table_name must be a string');
	});

	test('uses model id_strategy over server default', async function () {
		connection_options_state.id_strategy = 'uuidv7';

		const schema_instance = build_schema_instance();
		const account_model = model(schema_instance, {
			table_name: 'accounts',
			id_strategy: 'bigserial'
		});

		await account_model.ensure_table();

		expect(ensure_table_mock).toHaveBeenCalledWith('accounts', 'data', 'bigserial');
	});

	test('uses server default when model id_strategy is not set', async function () {
		connection_options_state.id_strategy = 'uuidv7';

		const schema_instance = build_schema_instance();
		const event_model = model(schema_instance, {
			table_name: 'events'
		});

		await event_model.ensure_table();

		expect(ensure_table_mock).toHaveBeenCalledWith('events', 'data', 'uuidv7');
	});

	test('forwards resolved id_strategy into ensure_schema', async function () {
		connection_options_state.id_strategy = 'uuidv7';

		const schema_instance = build_schema_instance();
		const profile_model = model(schema_instance, {
			table_name: 'profiles',
			id_strategy: 'bigserial'
		});

		await profile_model.ensure_schema();

		expect(ensure_schema_mock).toHaveBeenCalledWith('profiles', 'data', schema_instance, 'bigserial');
	});

	test('throws when uuidv7 is selected on an unsupported connected server', function () {
		connection_options_state.id_strategy = 'uuidv7';
		server_capabilities_state.server_version = '17.4';
		server_capabilities_state.server_version_num = 170004;
		server_capabilities_state.supports_uuidv7 = false;

		const schema_instance = build_schema_instance();

		expect(function create_uuidv7_model_on_unsupported_server() {
			model(schema_instance, {
				table_name: 'profiles'
			});
		}).toThrow('id_strategy=uuidv7 requires PostgreSQL native uuidv7() support');
	});

	test('throws when neither model nor server provide id_strategy', async function () {
		connection_options_state.id_strategy = undefined;
		const schema_instance = build_schema_instance();
		const profile_model = model(schema_instance, {
			table_name: 'profiles'
		});

		await expect(profile_model.ensure_table()).rejects.toThrow('id_strategy must be one of: bigserial, uuidv7');
	});

	test('throws for unsupported id_strategy values', async function () {
		const schema_instance = build_schema_instance();
		const profile_model = model(schema_instance, {
			table_name: 'profiles',
			id_strategy: 'uuid'
		});

		await expect(profile_model.ensure_table()).rejects.toThrow('id_strategy must be one of: bigserial, uuidv7');
	});
});

function build_schema_instance() {
	return {
		validate: function (input_payload) {
			return input_payload;
		}
	};
}
