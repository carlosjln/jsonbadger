import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const ensure_table_mock = jest.fn();
const ensure_schema_mock = jest.fn();
const default_server_capabilities = {
	server_version: '18.0',
	server_version_num: 180000,
	supports_uuidv7: true
};
const account_model_options = {
	table_name: 'accounts',
	id_strategy: 'bigserial'
};
const unsupported_uuidv7_server_capabilities = {
	server_version: '17.4',
	server_version_num: 170004,
	supports_uuidv7: false
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

const {default: defaults} = await import('#src/constants/defaults.js');
const {default: model} = await import('#src/model/factory/index.js');

describe('ID strategy resolution', function () {
	let connection;

	beforeEach(function reset_test_state() {
		ensure_table_mock.mockReset();
		ensure_schema_mock.mockReset();
		ensure_schema_mock.mockResolvedValue(undefined);
		connection = create_connection();
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
		connection = create_connection({id_strategy: 'uuidv7'});

		const schema_instance = build_schema_instance();
		const account_model = model(
			schema_instance,
			account_model_options,
			connection,
			'Account'
		);

		await account_model.ensure_table();

		expect(ensure_table_mock).toHaveBeenCalledWith('accounts', 'data', 'bigserial', connection);
	});

	test('uses server default when model id_strategy is not set', async function () {
		connection = create_connection({id_strategy: 'uuidv7'});

		const schema_instance = build_schema_instance();
		const event_model = model(schema_instance, {
			table_name: 'events'
		}, connection, 'Event');

		await event_model.ensure_table();

		expect(ensure_table_mock).toHaveBeenCalledWith('events', 'data', 'uuidv7', connection);
	});

	test('forwards resolved id_strategy into ensure_schema', async function () {
		connection = create_connection({id_strategy: 'uuidv7'});

		const schema_instance = build_schema_instance();
		const profile_model = model(schema_instance, {
			table_name: 'profiles',
			id_strategy: 'bigserial'
		}, connection, 'Profile');

		await profile_model.ensure_schema();

		expect(ensure_schema_mock).toHaveBeenCalledWith('profiles', 'data', schema_instance, 'bigserial', connection);
	});

	test('throws when uuidv7 is selected on an unsupported connected server', function () {
		connection = create_connection({id_strategy: 'uuidv7'}, unsupported_uuidv7_server_capabilities);

		const schema_instance = build_schema_instance();

		expect(function create_uuidv7_model_on_unsupported_server() {
			model(schema_instance, {
				table_name: 'profiles'
			}, connection, 'Profile');
		}).toThrow('id_strategy=uuidv7 requires PostgreSQL native uuidv7() support');
	});

	test('throws when neither model nor server provide id_strategy', async function () {
		connection = create_connection({id_strategy: undefined});
		const schema_instance = build_schema_instance();
		const profile_model = model(schema_instance, {
			table_name: 'profiles'
		}, connection, 'Profile');

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

function create_connection(options = {}, server_capabilities = undefined) {
	return {
		options: Object.assign({}, defaults.connection_options, options),
		server_capabilities: server_capabilities === undefined
			? default_server_capabilities
			: server_capabilities
	};
}

function build_schema_instance() {
	return {
		validate: function (input_payload) {
			return input_payload;
		}
	};
}
