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
const saved_name = 'Saved';
const saved_payload_json = '{"name":"Saved"}';
const saved_id = '9';
const saved_created_at = '2026-02-27T10:00:00.000Z';
const saved_updated_at = '2026-02-27T11:00:00.000Z';
const provided_uuidv7_id = '0194f028-579a-7b5b-8107-b9ad31395f43';
const caller_created_at = '2026-03-03T08:00:00.000Z';
const caller_updated_at = '2026-03-03T09:00:00.000Z';

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
			rows: [{
				id: saved_id,
				data: {name: saved_name},
				created_at: new Date(saved_created_at),
				updated_at: new Date(saved_updated_at)
			}]
		});
	});

	test('uses database-generated uuidv7 ids for uuidv7 strategy', async function () {
		connection_options_state.id_strategy = 'uuidv7';

		const schema_instance = build_schema_instance();
		const event_model = model(schema_instance, {table_name: 'events'});
		const event_document = new event_model({name: saved_name});
		pool_state.connected = true;

		const saved_value = await event_document.save();

		expect(ensure_table_mock).toHaveBeenCalledWith('events', 'data', 'uuidv7');
		expect(sql_runner_mock).toHaveBeenCalledTimes(1);
		expect(sql_runner_mock.mock.calls[0][0]).toContain(
			'INSERT INTO "events" ("data", created_at, updated_at) VALUES ($1::jsonb, $2::timestamptz, $3::timestamptz)'
		);
		expect(sql_runner_mock.mock.calls[0][0]).not.toContain('("data", id,');
		expect(sql_runner_mock.mock.calls[0][1][0]).toBe(saved_payload_json);
		expect(sql_runner_mock.mock.calls[0][1]).toHaveLength(3);
		expect(saved_value).toBe(event_document);
		expect(saved_value.to_json()).toEqual({
			name: saved_name,
			id: saved_id,
			created_at: saved_created_at,
			updated_at: saved_updated_at
		});
	});

	test('passes caller-provided uuidv7 id on create when present', async function () {
		connection_options_state.id_strategy = 'uuidv7';

		const schema_instance = build_schema_instance();
		const event_model = model(schema_instance, {table_name: 'events'});
		const event_document = new event_model({
			id: provided_uuidv7_id,
			name: saved_name
		});
		pool_state.connected = true;

		await event_document.save();

		expect(sql_runner_mock).toHaveBeenCalledTimes(1);
		expect(sql_runner_mock.mock.calls[0][0]).toContain(
			'INSERT INTO "events" ("data", id, created_at, updated_at) VALUES ($1::jsonb, $2::uuid, $3::timestamptz, $4::timestamptz)'
		);
		expect(sql_runner_mock.mock.calls[0][1]).toEqual(
			expect.arrayContaining([saved_payload_json, provided_uuidv7_id])
		);
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
		const event_document = new event_model({name: saved_name});
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

		const saved_value = await counter_document.save();

		expect(sql_runner_mock).toHaveBeenCalledTimes(1);
		expect(sql_runner_mock.mock.calls[0][0]).toContain(
			'INSERT INTO "counters" ("data", created_at, updated_at) VALUES ($1::jsonb, $2::timestamptz, $3::timestamptz)'
		);
		expect(sql_runner_mock.mock.calls[0][1][0]).toEqual('{"count64":"9007199254740993"}');
		expect(saved_value.id).toBe(saved_id);
	});

	test('uses bigserial create semantics and omits caller-provided id', async function () {
		const schema_instance = build_schema_instance();
		const user_model = model(schema_instance, {
			table_name: 'users'
		});
		const user_document = new user_model({
			id: 99,
			name: saved_name
		});

		const saved_value = await user_document.save();

		expect(ensure_table_mock).toHaveBeenCalledWith('users', 'data', 'bigserial');
		expect(sql_runner_mock).toHaveBeenCalledTimes(1);
		expect(sql_runner_mock.mock.calls[0][0]).toContain(
			'INSERT INTO "users" ("data", created_at, updated_at) VALUES ($1::jsonb, $2::timestamptz, $3::timestamptz)'
		);
		expect(sql_runner_mock.mock.calls[0][0]).not.toContain('("data", id,');
		expect(sql_runner_mock.mock.calls[0][1][0]).toEqual(saved_payload_json);
		expect(saved_value.created_at).toBe(saved_created_at);
	});

	test('uses caller-provided timestamps on create and keeps base fields out of payload json', async function () {
		const schema_instance = build_schema_instance();
		const user_model = model(schema_instance, {
			table_name: 'users'
		});
		const user_document = new user_model({
			name: saved_name,
			created_at: caller_created_at,
			updated_at: caller_updated_at
		});

		await user_document.save();

		expect(sql_runner_mock).toHaveBeenCalledTimes(1);
		expect(sql_runner_mock.mock.calls[0][1]).toEqual([
			saved_payload_json,
			caller_created_at,
			caller_updated_at
		]);
	});

	test('auto-fills timestamps on create when omitted', async function () {
		const schema_instance = build_schema_instance();
		const user_model = model(schema_instance, {
			table_name: 'users'
		});
		const user_document = new user_model({
			name: saved_name
		});

		await user_document.save();

		const create_params = sql_runner_mock.mock.calls[0][1];
		expect(create_params[0]).toBe(saved_payload_json);
		expect(typeof create_params[1]).toBe('string');
		expect(typeof create_params[2]).toBe('string');
		expect(Number.isNaN(new Date(create_params[1]).getTime())).toBe(false);
		expect(Number.isNaN(new Date(create_params[2]).getTime())).toBe(false);
	});
});

function build_schema_instance() {
	return {
		validate: function (input_payload) {
			return input_payload;
		}
	};
}
