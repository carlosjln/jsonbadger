import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const sql_runner_mock = jest.fn();

jest.unstable_mockModule('#src/sql/sql-runner.js', function () {
	return {
		default: sql_runner_mock
	};
});

const {default: QueryBuilder} = await import('#src/query/query-builder.js');

describe('QueryBuilder.exec read behavior', function () {
	beforeEach(function () {
		sql_runner_mock.mockReset();
	});

	test('find_one does not auto-create tables via ensure_table', async function () {
		const ensure_table_spy = jest.fn();
		sql_runner_mock.mockResolvedValueOnce({rows: [{data: {user_name: 'john'}}]});

		const query_builder = new QueryBuilder({
			schema_instance: null,
			model_options: {table_name: 'users', data_column: 'data'},
			ensure_table: ensure_table_spy
		}, 'find_one', {user_name: 'john'}, null);

		const result = await query_builder.exec();

		expect(result).toEqual({user_name: 'john'});
		expect(ensure_table_spy).not.toHaveBeenCalled();
		expect(sql_runner_mock).toHaveBeenCalledTimes(1);
	});

	test('count_documents does not auto-create tables via ensure_table', async function () {
		const ensure_table_spy = jest.fn();
		sql_runner_mock.mockResolvedValueOnce({rows: [{total_count: 2}]});

		const query_builder = new QueryBuilder({
			schema_instance: null,
			model_options: {table_name: 'users', data_column: 'data'},
			ensure_table: ensure_table_spy
		}, 'count_documents', {}, null);

		const result = await query_builder.exec();

		expect(result).toBe(2);
		expect(ensure_table_spy).not.toHaveBeenCalled();
		expect(sql_runner_mock).toHaveBeenCalledTimes(1);
	});

	test('count_documents returns zero when no rows are returned', async function () {
		sql_runner_mock.mockResolvedValueOnce({rows: []});

		const query_builder = new QueryBuilder({
			schema_instance: null,
			model_options: {table_name: 'users', data_column: 'data'},
			ensure_table: jest.fn()
		}, 'count_documents', {}, null);

		const result = await query_builder.exec();

		expect(result).toBe(0);
	});

	test('query builder chain methods configure find SQL and map rows', async function () {
		sql_runner_mock.mockResolvedValueOnce({
			rows: [
				{data: {user_name: 'amy'}},
				{data: {user_name: 'bob'}}
			]
		});

		const query_builder = new QueryBuilder({
			schema_instance: null,
			model_options: {table_name: 'users', data_column: 'data'},
			ensure_table: jest.fn()
		}, 'find', {active: true}, null);

		expect(query_builder.where({role: 'admin'})).toBe(query_builder);
		expect(query_builder.sort({user_name: -1})).toBe(query_builder);
		expect(query_builder.limit(2.8)).toBe(query_builder);
		expect(query_builder.skip('1.2')).toBe(query_builder);

		const result = await query_builder.exec();
		const sql_text = sql_runner_mock.mock.calls[0][0];

		expect(result).toEqual([{user_name: 'amy'}, {user_name: 'bob'}]);
		expect(sql_text).toContain('SELECT "data" AS data FROM "users" WHERE');
		expect(sql_text).toContain(' ORDER BY "data" ->> \'user_name\' DESC');
		expect(sql_text).toContain(' LIMIT 2');
		expect(sql_text).toContain(' OFFSET 1');
	});

	test('find_one returns null when no rows are returned', async function () {
		sql_runner_mock.mockResolvedValueOnce({rows: []});

		const query_builder = new QueryBuilder({
			schema_instance: null,
			model_options: {table_name: 'users', data_column: 'data'},
			ensure_table: jest.fn()
		}, 'find_one', {user_name: 'missing'}, null);

		const result = await query_builder.exec();

		expect(result).toBeNull();
	});

	test('find_one respects an explicit limit and does not overwrite it with 1', async function () {
		sql_runner_mock.mockResolvedValueOnce({rows: [{data: {user_name: 'john'}}]});

		const query_builder = new QueryBuilder({
			schema_instance: null,
			model_options: {table_name: 'users', data_column: 'data'},
			ensure_table: jest.fn()
		}, 'find_one', {user_name: 'john'}, null);

		query_builder.limit(5);
		await query_builder.exec();

		const sql_text = sql_runner_mock.mock.calls[0][0];
		expect(sql_text).toContain(' LIMIT 5');
		expect(sql_text).not.toContain(' LIMIT 1 OFFSET');
	});
});
