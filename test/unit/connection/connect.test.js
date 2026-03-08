import {beforeEach, describe, expect, jest, test} from '@jest/globals';
import Connection from '#src/connection/connection.js';

const Pool_mock = jest.fn();
const debug_logger_mock = jest.fn();
const scan_server_capabilities_mock = jest.fn();
const assert_id_strategy_capability_mock = jest.fn();
const uri = 'postgresql://example/db';
const default_connect_options = {
	id_strategy: 'bigserial',
	auto_index: true,
	debug: false
};
const server_capabilities = {
	server_version: '18.1',
	server_version_num: 180001,
	supports_uuidv7: true
};

const pool_store_state = {
	has_pool: false,
	pool_instance: null,
	connection_instance: null,
	set_pool_updates: []
};

const pool_instance_state = {
	query: jest.fn(),
	end: jest.fn()
};

jest.unstable_mockModule('pg', function () {
	return {
		Pool: Pool_mock
	};
});

jest.unstable_mockModule('#src/debug/debug-logger.js', function () {
	return {
		default: debug_logger_mock
	};
});

jest.unstable_mockModule('#src/connection/server-capabilities.js', function () {
	return {
		scan_server_capabilities: scan_server_capabilities_mock,
		assert_id_strategy_capability: assert_id_strategy_capability_mock
	};
});

jest.unstable_mockModule('#src/connection/pool-store.js', function () {
	return {
		has_pool: function () {
			return pool_store_state.has_pool;
		},

		get_connection: function () {
			return pool_store_state.connection_instance;
		},

		set_pool: function (state_update) {
			pool_store_state.pool_instance = state_update.pool_instance;
			pool_store_state.connection_instance = state_update.connection_instance;
			pool_store_state.set_pool_updates.push(state_update);
		}
	};
});

const {default: connect} = await import('#src/connection/connect.js');

describe('connect', function () {
	beforeEach(function () {
		Pool_mock.mockReset();
		debug_logger_mock.mockReset();
		scan_server_capabilities_mock.mockReset();
		assert_id_strategy_capability_mock.mockReset();
		pool_instance_state.query.mockReset();
		pool_instance_state.end.mockReset();

		pool_store_state.has_pool = false;
		pool_store_state.pool_instance = null;
		pool_store_state.connection_instance = null;
		pool_store_state.set_pool_updates = [];

		Pool_mock.mockImplementation(function () {
			return pool_instance_state;
		});

		pool_instance_state.query.mockResolvedValue({rows: []});
		pool_instance_state.end.mockResolvedValue(undefined);

		scan_server_capabilities_mock.mockResolvedValue(server_capabilities);
		assert_id_strategy_capability_mock.mockImplementation(function () {
		});
	});

	describe('connection startup', function () {
		test('returns a connection and stores capabilities in pool state', async function () {
			const connection = await connect(uri, default_connect_options);

			expect(connection).toBeInstanceOf(Connection);
			expect(connection.pool_instance).toBe(pool_instance_state);
			expect(connection.server_capabilities).toEqual(server_capabilities);
			expect(Pool_mock).toHaveBeenCalledTimes(1);
			expect(pool_instance_state.query).toHaveBeenCalledWith('SELECT 1');
			expect(scan_server_capabilities_mock).toHaveBeenCalledWith(pool_instance_state);

			expect(assert_id_strategy_capability_mock).toHaveBeenCalledWith('bigserial', server_capabilities);

			expect(pool_store_state.connection_instance).toBe(connection);
			expect(pool_store_state.set_pool_updates).toHaveLength(1);

			const stored_state_update = pool_store_state.set_pool_updates[0];

			expect(stored_state_update.pool_instance).toBe(pool_instance_state);
			expect(stored_state_update.options).toEqual(expect.objectContaining({
				id_strategy: 'bigserial',
				auto_index: true,
				debug: false
			}));
			expect(stored_state_update.server_capabilities).toEqual(server_capabilities);
			expect(stored_state_update.connection_instance).toBe(connection);
		});

		test('stores normalized default options when connect options are omitted', async function () {
			const connection = await connect(uri);

			expect(connection).toBeInstanceOf(Connection);
			expect(pool_store_state.set_pool_updates).toHaveLength(1);
			expect(pool_store_state.set_pool_updates[0].options).toEqual(expect.objectContaining({
				id_strategy: 'bigserial',
				auto_index: true,
				debug: false
			}));
		});
	});

	describe('connection reuse', function () {
		test('returns existing connection without rescanning when already connected', async function () {
			const existing_connection = new Connection({existing_pool: true}, {}, null);

			pool_store_state.has_pool = true;
			pool_store_state.connection_instance = existing_connection;

			const connection = await connect(uri, {
				id_strategy: 'bigserial'
			});

			expect(connection).toBe(existing_connection);
			expect(Pool_mock).not.toHaveBeenCalled();
			expect(scan_server_capabilities_mock).not.toHaveBeenCalled();
			expect(pool_store_state.set_pool_updates).toHaveLength(0);
		});
	});

	describe('startup failure cleanup', function () {
		test('fails fast and closes pool when uuidv7 capability assertion fails', async function () {
			assert_id_strategy_capability_mock.mockImplementation(function () {
				throw new Error('uuidv7 unsupported');
			});

			await expect(connect(uri, {
				id_strategy: 'uuidv7',
				auto_index: true
			})).rejects.toThrow('uuidv7 unsupported');

			expect(pool_instance_state.end).toHaveBeenCalledTimes(1);
			expect(pool_store_state.set_pool_updates).toHaveLength(0);
		});

		test('preserves the original startup error when the pool has no end method', async function () {
			const startup_error = new Error('startup failed');

			Pool_mock.mockImplementation(function () {
				return {
					query: jest.fn().mockRejectedValue(startup_error)
				};
			});

			await expect(connect(uri, {
				id_strategy: 'bigserial',
				auto_index: true
			})).rejects.toThrow('startup failed');

			expect(pool_store_state.set_pool_updates).toHaveLength(0);
		});

		test('preserves the original startup error when pool shutdown also fails', async function () {
			const startup_error = new Error('startup failed');
			const shutdown_error = new Error('shutdown failed');

			pool_instance_state.query.mockRejectedValue(startup_error);
			pool_instance_state.end.mockRejectedValue(shutdown_error);

			await expect(connect(uri, {
				id_strategy: 'bigserial',
				auto_index: true
			})).rejects.toThrow('startup failed');

			expect(pool_instance_state.end).toHaveBeenCalledTimes(1);
			expect(pool_store_state.set_pool_updates).toHaveLength(0);
		});
	});

	describe('returned connection behavior', function () {
		test('returned connection can disconnect the pool directly', async function () {
			const connection = await connect(uri, default_connect_options);

			await connection.disconnect();

			expect(pool_instance_state.end).toHaveBeenCalledTimes(1);
		});
	});
});
