import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const debug_logger_mock = jest.fn();
const get_debug_mode_mock = jest.fn();
const get_pool_mock = jest.fn();

jest.unstable_mockModule('#src/debug/debug-logger.js', function () {
	return {
		default: debug_logger_mock
	};
});

jest.unstable_mockModule('#src/connection/pool-store.js', function () {
	return {
		get_debug_mode: get_debug_mode_mock,
		get_pool: get_pool_mock
	};
});

const {default: QueryError} = await import('#src/errors/query-error.js');
const {default: sql_runner} = await import('#src/sql/sql-runner.js');

describe('sql_runner', function () {
	beforeEach(function () {
		debug_logger_mock.mockReset();
		get_debug_mode_mock.mockReset();
		get_pool_mock.mockReset();
	});

	test('runs SQL with provided params and logs sql_query event', async function () {
		const query_mock = jest.fn().mockResolvedValueOnce({rows: [{id: 1}]});

		get_debug_mode_mock.mockReturnValueOnce(true);
		get_pool_mock.mockReturnValueOnce({query: query_mock});

		const result = await sql_runner('SELECT 1', ['x']);

		expect(result).toEqual({rows: [{id: 1}]});
		expect(get_debug_mode_mock).toHaveBeenCalledTimes(1);
		expect(get_pool_mock).toHaveBeenCalledTimes(1);
		expect(query_mock).toHaveBeenCalledWith('SELECT 1', ['x']);
		expect(debug_logger_mock).toHaveBeenCalledTimes(1);
		expect(debug_logger_mock).toHaveBeenCalledWith(true, 'sql_query', {
			sql_text: 'SELECT 1',
			params: ['x']
		});
	});

	test('uses empty params array when sql_params is omitted', async function () {
		const query_mock = jest.fn().mockResolvedValueOnce({rows: []});

		get_debug_mode_mock.mockReturnValueOnce(false);
		get_pool_mock.mockReturnValueOnce({query: query_mock});

		await sql_runner('SELECT 1');

		expect(query_mock).toHaveBeenCalledWith('SELECT 1', []);
		expect(debug_logger_mock).toHaveBeenCalledWith(false, 'sql_query', {
			sql_text: 'SELECT 1',
			params: []
		});
	});

	test('logs sql_error and throws QueryError when pool query fails', async function () {
		const pool_error = new Error('db offline');
		const query_mock = jest.fn().mockRejectedValueOnce(pool_error);

		get_debug_mode_mock.mockReturnValueOnce(true);
		get_pool_mock.mockReturnValueOnce({query: query_mock});

		let thrown_error = null;

		try {
			await sql_runner('SELECT * FROM users WHERE id = $1', [7]);
		} catch(error) {
			thrown_error = error;
		}

		expect(query_mock).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', [7]);
		expect(debug_logger_mock).toHaveBeenCalledTimes(2);
		expect(debug_logger_mock).toHaveBeenNthCalledWith(1, true, 'sql_query', {
			sql_text: 'SELECT * FROM users WHERE id = $1',
			params: [7]
		});

		expect(debug_logger_mock).toHaveBeenNthCalledWith(2, true, 'sql_error', {
			sql_text: 'SELECT * FROM users WHERE id = $1',
			params: [7],
			message: 'db offline'
		});

		expect(thrown_error).toBeInstanceOf(QueryError);
		expect(thrown_error.message).toBe('SQL execution failed');
		expect(thrown_error.details).toEqual({
			sql_text: 'SELECT * FROM users WHERE id = $1',
			params: [7],
			cause: 'db offline'
		});
	});
});
