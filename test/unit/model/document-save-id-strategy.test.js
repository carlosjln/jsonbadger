import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const ensure_table_mock = jest.fn();
const sql_runner_mock = jest.fn();
const connection_options_state = {id_strategy: 'bigserial', auto_index: true};
const pool_state = {connected: false};
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

jest.unstable_mockModule('#src/sql/sql-runner.js', function build_sql_runner_mock() {
	return {
		default: sql_runner_mock
	};
});

jest.unstable_mockModule('#src/connection/pool-store.js', function build_pool_store_mock() {
	return {
		get_connection_options: function () {
			return connection_options_state;
		},

		has_pool: function () {
			return pool_state.connected;
		},

		get_server_capabilities: function () {
			return server_capabilities_state;
		}
	};
});

const {default: model} = await import('#src/model/model-factory.js');

describe('Document save id strategy', function () {
	beforeEach(function reset_test_state() {
		ensure_table_mock.mockReset();
		sql_runner_mock.mockReset();

		connection_options_state.id_strategy = 'bigserial';
		connection_options_state.auto_index = true;

		pool_state.connected = false;

		server_capabilities_state.server_version = '18.0';
		server_capabilities_state.server_version_num = 180000;
		server_capabilities_state.supports_uuidv7 = true;

		sql_runner_mock.mockResolvedValue({
			rows: [{data: {name: 'Saved'}}]
		});
	});

	test('uses database-generated uuidv7 ids for uuidv7 strategy', async function () {
		connection_options_state.id_strategy = 'uuidv7';

		const schema_instance = build_schema_instance();
		const event_model = model(schema_instance, {table_name: 'events'});
		const event_document = new event_model({name: 'Saved'});
		pool_state.connected = true;

		await event_document.save();

		expect(ensure_table_mock).toHaveBeenCalledWith('events', 'data', 'uuidv7');
		expect(sql_runner_mock).toHaveBeenCalledTimes(1);
		expect(sql_runner_mock.mock.calls[0][0]).toContain('INSERT INTO "events" ("data") VALUES ($1::jsonb)');
		expect(sql_runner_mock.mock.calls[0][1]).toEqual(['{"name":"Saved"}']);
	});

	test('throws before save when uuidv7 is unsupported on connected server', async function () {
		connection_options_state.id_strategy = 'uuidv7';
		server_capabilities_state.server_version = '17.4';
		server_capabilities_state.server_version_num = 170004;
		server_capabilities_state.supports_uuidv7 = false;

		const schema_instance = build_schema_instance();
		const event_model = model(schema_instance, {
			table_name: 'events'
		});
		const event_document = new event_model({name: 'Saved'});
		pool_state.connected = true;

		await expect(event_document.save()).rejects.toThrow('id_strategy=uuidv7 requires PostgreSQL native uuidv7() support');
		expect(ensure_table_mock).not.toHaveBeenCalled();
		expect(sql_runner_mock).not.toHaveBeenCalled();
	});

	test('serializes bigint values safely for JSONB inserts', async function () {
		const schema_instance = {
			validate: function () {
				return {count64: 9007199254740993n};
			}
		};
		const counter_model = model(schema_instance, {
			table_name: 'counters'
		});
		const counter_document = new counter_model({});

		await counter_document.save();

		expect(sql_runner_mock).toHaveBeenCalledTimes(1);
		expect(sql_runner_mock.mock.calls[0][0]).toContain('INSERT INTO "counters" ("data") VALUES ($1::jsonb)');
		expect(sql_runner_mock.mock.calls[0][1]).toEqual(['{"count64":"9007199254740993"}']);
	});

	test('uses bigserial insert shape when strategy resolves to bigserial', async function () {
		const schema_instance = build_schema_instance();
		const user_model = model(schema_instance, {
			table_name: 'users'
		});
		const user_document = new user_model({
			name: 'Saved'
		});

		await user_document.save();

		expect(ensure_table_mock).toHaveBeenCalledWith('users', 'data', 'bigserial');
		expect(sql_runner_mock).toHaveBeenCalledTimes(1);
		expect(sql_runner_mock.mock.calls[0][0]).toContain('INSERT INTO "users" ("data") VALUES ($1::jsonb)');
		expect(sql_runner_mock.mock.calls[0][1]).toEqual(['{"name":"Saved"}']);
	});
});

function build_schema_instance() {
	return {
		validate: function (input_payload) {
			return input_payload;
		}
	};
}
