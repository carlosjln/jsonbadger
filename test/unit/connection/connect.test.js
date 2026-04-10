import {beforeEach, describe, expect, jest, test} from '@jest/globals';
import Connection from '#src/connection/connection.js';

const Pool_mock = jest.fn();
const debug_logger_mock = jest.fn();
const scan_server_capabilities_mock = jest.fn();
const uri = 'postgresql://example/db';
const default_connect_options = {
	auto_index: true,
	debug: false
};
const server_capabilities = {
	server_version: '18.1',
	server_version_num: 180001,
	supports_uuidv7: true
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
		scan_server_capabilities: scan_server_capabilities_mock
	};
});

const {default: connect} = await import('#src/connection/connect.js');

describe('connect', function () {
	beforeEach(function () {
		Pool_mock.mockReset();
		debug_logger_mock.mockReset();
		scan_server_capabilities_mock.mockReset();
		pool_instance_state.query.mockReset();
		pool_instance_state.end.mockReset();

		Pool_mock.mockImplementation(function () {
			return pool_instance_state;
		});

		pool_instance_state.query.mockResolvedValue({rows: []});
		pool_instance_state.end.mockResolvedValue(undefined);

		scan_server_capabilities_mock.mockResolvedValue(server_capabilities);
	});

		describe('connection startup', function () {
		test('returns a connection and stores capabilities on the connection instance', async function () {
			const connection = await connect(uri, default_connect_options);

			expect(connection).toBeInstanceOf(Connection);
			expect(connection.pool_instance).toBe(pool_instance_state);
			expect(connection.server_capabilities).toEqual(server_capabilities);
			expect(Pool_mock).toHaveBeenCalledTimes(1);
			expect(pool_instance_state.query).toHaveBeenCalledWith('SELECT 1');
			expect(scan_server_capabilities_mock).toHaveBeenCalledWith(pool_instance_state);
		});

		test('stores normalized default options when connect options are omitted', async function () {
			const connection = await connect(uri);

			expect(connection).toBeInstanceOf(Connection);
			expect(connection.options).toEqual(expect.objectContaining({
				max: 10,
				debug: false
			}));
			});
		});

		describe('connection identity', function () {
			test('returns a distinct connection on each call', async function () {
				const first_pool_instance = {
					query: jest.fn().mockResolvedValue({rows: []}),
					end: jest.fn().mockResolvedValue(undefined)
				};
				const second_pool_instance = {
					query: jest.fn().mockResolvedValue({rows: []}),
					end: jest.fn().mockResolvedValue(undefined)
				};

				Pool_mock
					.mockImplementationOnce(function () {
						return first_pool_instance;
					})
					.mockImplementationOnce(function () {
						return second_pool_instance;
					});

				const first_connection = await connect(uri, {debug: false});
				const second_connection = await connect(uri, {debug: false});

				expect(first_connection).toBeInstanceOf(Connection);
				expect(second_connection).toBeInstanceOf(Connection);
				expect(second_connection).not.toBe(first_connection);
				expect(Pool_mock).toHaveBeenCalledTimes(2);
				expect(scan_server_capabilities_mock).toHaveBeenCalledTimes(2);
				expect(first_connection.pool_instance).toBe(first_pool_instance);
				expect(second_connection.pool_instance).toBe(second_pool_instance);
			});
		});

	describe('startup failure cleanup', function () {
		test('preserves the original startup error when the pool has no end method', async function () {
			const startup_error = new Error('startup failed');

			Pool_mock.mockImplementation(function () {
				return {
					query: jest.fn().mockRejectedValue(startup_error)
				};
			});

			await expect(connect(uri, {
				auto_index: true
			})).rejects.toThrow('startup failed');

		});

		test('preserves the original startup error when pool shutdown also fails', async function () {
			const startup_error = new Error('startup failed');
			const shutdown_error = new Error('shutdown failed');

			pool_instance_state.query.mockRejectedValue(startup_error);
			pool_instance_state.end.mockRejectedValue(shutdown_error);

			await expect(connect(uri, {
				auto_index: true
			})).rejects.toThrow('startup failed');

			expect(pool_instance_state.end).toHaveBeenCalledTimes(1);
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
