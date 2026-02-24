import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const Pool_mock = jest.fn();
const debug_logger_mock = jest.fn();
const scan_server_capabilities_mock = jest.fn();
const assert_id_strategy_capability_mock = jest.fn();

const pool_store_state = {
	has_pool: false,
	pool_instance: null,
	set_pool_calls: []
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

		get_pool: function () {
			return pool_store_state.pool_instance;
		},

		set_pool: function (pool_instance, connection_options, server_capabilities) {
			pool_store_state.pool_instance = pool_instance;
			pool_store_state.set_pool_calls.push([pool_instance, connection_options, server_capabilities]);
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
		pool_store_state.set_pool_calls = [];

		Pool_mock.mockImplementation(function () {
			return pool_instance_state;
		});

		pool_instance_state.query.mockResolvedValue({rows: []});
		pool_instance_state.end.mockResolvedValue(undefined);

		scan_server_capabilities_mock.mockResolvedValue({
			server_version: '18.1',
			server_version_num: 180001,
			supports_uuidv7: true
		});
		assert_id_strategy_capability_mock.mockImplementation(function () {
		});
	});

	test('runs startup capability scan and stores server capabilities in pool state', async function () {
		const pool_instance = await connect('postgresql://example/db', {
			id_strategy: 'bigserial',
			auto_index: true,
			debug: false
		});

		expect(pool_instance).toBe(pool_instance_state);
		expect(Pool_mock).toHaveBeenCalledTimes(1);
		expect(pool_instance_state.query).toHaveBeenCalledWith('SELECT 1');
		expect(scan_server_capabilities_mock).toHaveBeenCalledWith(pool_instance_state);

		expect(assert_id_strategy_capability_mock).toHaveBeenCalledWith('bigserial', {
			server_version: '18.1',
			server_version_num: 180001,
			supports_uuidv7: true
		});

		expect(pool_store_state.set_pool_calls).toHaveLength(1);

		expect(pool_store_state.set_pool_calls[0][2]).toEqual({
			server_version: '18.1',
			server_version_num: 180001,
			supports_uuidv7: true
		});
	});

	test('returns existing pool without rescanning when already connected', async function () {
		pool_store_state.has_pool = true;
		pool_store_state.pool_instance = {existing: true};

		const pool_instance = await connect('postgresql://example/db', {
			id_strategy: 'bigserial'
		});

		expect(pool_instance).toEqual({existing: true});
		expect(Pool_mock).not.toHaveBeenCalled();
		expect(scan_server_capabilities_mock).not.toHaveBeenCalled();
	});

	test('fails fast and closes pool when uuidv7 capability assertion fails', async function () {
		assert_id_strategy_capability_mock.mockImplementation(function () {
			throw new Error('uuidv7 unsupported');
		});

		await expect(connect('postgresql://example/db', {
			id_strategy: 'uuidv7',
			auto_index: true
		})).rejects.toThrow('uuidv7 unsupported');

		expect(pool_instance_state.end).toHaveBeenCalledTimes(1);
		expect(pool_store_state.set_pool_calls).toHaveLength(0);
	});
});
