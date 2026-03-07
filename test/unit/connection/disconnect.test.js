import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const debug_logger_mock = jest.fn();
const clear_pool_mock = jest.fn();
const get_debug_mode_mock = jest.fn();
const get_pool_mock = jest.fn();
const has_pool_mock = jest.fn();

jest.unstable_mockModule('#src/debug/debug-logger.js', function () {
	return {
		default: debug_logger_mock
	};
});

jest.unstable_mockModule('#src/connection/pool-store.js', function () {
	return {
		clear_pool: clear_pool_mock,
		get_debug_mode: get_debug_mode_mock,
		get_pool: get_pool_mock,
		has_pool: has_pool_mock
	};
});

const {default: disconnect} = await import('#src/connection/disconnect.js');

describe('disconnect', function () {
	beforeEach(function () {
		debug_logger_mock.mockReset();
		clear_pool_mock.mockReset();
		get_debug_mode_mock.mockReset();
		get_pool_mock.mockReset();
		has_pool_mock.mockReset();
	});

	test('returns early when no pool is registered', async function () {
		has_pool_mock.mockReturnValue(false);

		await expect(disconnect()).resolves.toBeUndefined();

		expect(get_pool_mock).not.toHaveBeenCalled();
		expect(clear_pool_mock).not.toHaveBeenCalled();
		expect(debug_logger_mock).not.toHaveBeenCalled();
	});

	test('closes the pool, clears state, and logs the connection_closed event', async function () {
		const end_mock = jest.fn().mockResolvedValue(undefined);

		has_pool_mock.mockReturnValue(true);
		get_debug_mode_mock.mockReturnValue(true);
		get_pool_mock.mockReturnValue({
			end: end_mock
		});

		await expect(disconnect()).resolves.toBeUndefined();

		expect(end_mock).toHaveBeenCalledTimes(1);
		expect(clear_pool_mock).toHaveBeenCalledTimes(1);
		expect(debug_logger_mock).toHaveBeenCalledWith(true, 'connection_closed', null);
	});
});
