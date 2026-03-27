import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const debug_logger_mock = jest.fn();

jest.unstable_mockModule('#src/debug/debug-logger.js', function () {
	return {
		default: debug_logger_mock
	};
});

const {default: QueryError} = await import('#src/errors/query-error.js');
const {default: run} = await import('#src/sql/run.js');

describe('run', function () {
	beforeEach(function () {
		debug_logger_mock.mockReset();
	});

	test('runs SQL through the owning connection and logs sql_query event', async function () {
		const query_mock = jest.fn().mockResolvedValueOnce({rows: [{id: 1}]});
		const connection = {
			pool_instance: {query: query_mock},
			options: {debug: true}
		};

		const result = await run('SELECT 1', ['x'], connection);

		expect(result).toEqual({rows: [{id: 1}]});
		expect(query_mock).toHaveBeenCalledWith('SELECT 1', ['x']);
		expect(debug_logger_mock).toHaveBeenCalledTimes(1);
		expect(debug_logger_mock).toHaveBeenCalledWith(true, 'sql_query', {
			sql_text: 'SELECT 1',
			params: ['x']
		});
	});

	test('uses empty params array when sql_params is omitted', async function () {
		const query_mock = jest.fn().mockResolvedValueOnce({rows: []});
		const connection = {
			pool_instance: {query: query_mock},
			options: {debug: false}
		};

		await run('SELECT 1', undefined, connection);

		expect(query_mock).toHaveBeenCalledWith('SELECT 1', []);
		expect(debug_logger_mock).toHaveBeenCalledWith(false, 'sql_query', {
			sql_text: 'SELECT 1',
			params: []
		});
	});

	test('uses the connection pool instance directly', async function () {
		const query_mock = jest.fn().mockResolvedValueOnce({rows: [{id: 2}]});
		const connection = {
			pool_instance: {query: query_mock},
			options: {debug: true}
		};

		const result = await run('SELECT 2', ['y'], connection);

		expect(result).toEqual({rows: [{id: 2}]});
		expect(query_mock).toHaveBeenCalledWith('SELECT 2', ['y']);
		expect(debug_logger_mock).toHaveBeenCalledWith(true, 'sql_query', {
			sql_text: 'SELECT 2',
			params: ['y']
		});
	});

	test('rejects missing connection pool instances', async function () {
		await expect(run('SELECT 3', ['z'], {
			options: {debug: false}
		})).rejects.toThrow('run requires connection.pool_instance');
	});

	test('logs sql_error and throws QueryError when connection pool query fails', async function () {
		const pool_error = new Error('db offline');
		const query_mock = jest.fn().mockRejectedValueOnce(pool_error);
		const connection = {
			pool_instance: {query: query_mock},
			options: {debug: true}
		};

		let thrown_error = null;

		try {
			await run('SELECT * FROM users WHERE id = $1', [7], connection);
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
