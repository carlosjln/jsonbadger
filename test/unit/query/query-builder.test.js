import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const sql_runner_mock = jest.fn();

jest.unstable_mockModule('#src/sql/run.js', function () {
	return {
		default: sql_runner_mock
	};
});

const {default: QueryBuilder} = await import('#src/model/operations/query-builder.js');

describe('QueryBuilder.exec read behavior', function () {
	beforeEach(function () {
		sql_runner_mock.mockReset();
	});

	test('constructor requires model_constructor.model_options', function () {
		expect(function () {
			return new QueryBuilder({}, 'find', {}, null);
		}).toThrow('QueryBuilder requires model_constructor.model_options');
	});

	test('constructor and chain methods normalize falsy inputs to their defaults', function () {
		const query_builder = new QueryBuilder({
			schema_instance: null,
			model_options: {table_name: 'users', data_column: 'data'}
		}, 'find', null, undefined);

		expect(query_builder.base_filter).toEqual({});
		expect(query_builder.projection_value).toBeNull();

		expect(query_builder.where()).toBe(query_builder);
		expect(query_builder.where_filter).toEqual({});

		expect(query_builder.sort(0)).toBe(query_builder);
		expect(query_builder.sort_definition).toBeNull();
	});

	test('find_one does not auto-create tables via ensure_table', async function () {
		const ensure_table_spy = jest.fn();
		sql_runner_mock.mockResolvedValueOnce({
			rows: [{
				id: '7',
				data: {user_name: 'john'},
				created_at: new Date('2026-02-27T10:00:00.000Z'),
				updated_at: new Date('2026-02-27T11:00:00.000Z')
			}]
		});

		const query_builder = new QueryBuilder({
			schema_instance: null,
			model_options: {table_name: 'users', data_column: 'data'},
			ensure_table: ensure_table_spy
		}, 'find_one', {user_name: 'john'}, null);

		const result = await query_builder.exec();

		expect(result).toEqual({
			user_name: 'john',
			id: '7',
			created_at: '2026-02-27T10:00:00.000Z',
			updated_at: '2026-02-27T11:00:00.000Z'
		});
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
		expect(sql_runner_mock).toHaveBeenCalledWith(
			expect.any(String),
			expect.any(Array),
			null
		);
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
				{
					id: '1',
					data: {user_name: 'amy'},
					created_at: new Date('2026-02-27T10:00:00.000Z'),
					updated_at: new Date('2026-02-27T10:30:00.000Z')
				},
				{
					id: '2',
					data: {user_name: 'bob'},
					created_at: new Date('2026-02-27T11:00:00.000Z'),
					updated_at: new Date('2026-02-27T11:30:00.000Z')
				}
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

		expect(result).toEqual([
			{
				user_name: 'amy',
				id: '1',
				created_at: '2026-02-27T10:00:00.000Z',
				updated_at: '2026-02-27T10:30:00.000Z'
			},
			{
				user_name: 'bob',
				id: '2',
				created_at: '2026-02-27T11:00:00.000Z',
				updated_at: '2026-02-27T11:30:00.000Z'
			}
		]);
		expect(sql_text).toContain('SELECT id::text AS id, "data" AS data, created_at AS created_at, updated_at AS updated_at FROM "users" WHERE');
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

	test('find_one defaults limit to 1 and uses create_document_from_row when available', async function () {
		const hydrated_document = {hydrated: true};
		const create_document_from_row = jest.fn().mockReturnValue(hydrated_document);
		const connection = {
			pool_instance: {query: jest.fn()},
			options: {debug: true}
		};

		sql_runner_mock.mockResolvedValueOnce({
			rows: [{
				id: '7',
				data: {user_name: 'john'},
				created_at: new Date('2026-02-27T10:00:00.000Z'),
				updated_at: new Date('2026-02-27T11:00:00.000Z')
			}]
		});

		const query_builder = new QueryBuilder({
			connection: connection,
			schema_instance: null,
			model_options: {table_name: 'users', data_column: 'data'},
			create_document_from_row: create_document_from_row,
			resolve_id_strategy: function () {
				return 'uuidv7';
			}
		}, 'find_one', {id: '0194f028-579a-7b5b-8107-b9ad31395f43'}, null);

		const result = await query_builder.exec();
		const sql_text = sql_runner_mock.mock.calls[0][0];

		expect(result).toBe(hydrated_document);
		expect(create_document_from_row).toHaveBeenCalledWith({
			id: '7',
			data: {user_name: 'john'},
			created_at: new Date('2026-02-27T10:00:00.000Z'),
			updated_at: new Date('2026-02-27T11:00:00.000Z')
		});
		expect(sql_runner_mock).toHaveBeenCalledWith(
			expect.any(String),
			expect.any(Array),
			connection
		);
		expect(sql_text).toContain(' LIMIT 1');
		expect(sql_text).toContain('WHERE "id" = $1::uuid');
	});

	test('find_one respects an explicit limit and does not overwrite it with 1', async function () {
		sql_runner_mock.mockResolvedValueOnce({
			rows: [{
				id: '7',
				data: {user_name: 'john'},
				created_at: new Date('2026-02-27T10:00:00.000Z'),
				updated_at: new Date('2026-02-27T11:00:00.000Z')
			}]
		});

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

	test('find row fallback strips payload base fields and normalizes raw row metadata', async function () {
		sql_runner_mock.mockResolvedValueOnce({
			rows: [{
				id: null,
				data: {
					user_name: 'john',
					id: 'drop-me',
					created_at: 'drop-me-too',
					updated_at: 'drop-me-three'
				},
				created_at: 'not-a-date',
				updated_at: undefined
			}]
		});

		const query_builder = new QueryBuilder({
			schema_instance: null,
			model_options: {table_name: 'users', data_column: 'data'}
		}, 'find', {user_name: 'john'}, null);

		const result = await query_builder.exec();

		expect(result).toEqual([{
			user_name: 'john',
			id: null,
			created_at: 'not-a-date',
			updated_at: undefined
		}]);
	});

	test('find row fallback ignores non-object payloads and normalizes valid timestamp strings', async function () {
		sql_runner_mock.mockResolvedValueOnce({
			rows: [{
				id: 5,
				data: 'not-an-object',
				created_at: '2026-02-27T10:00:00.000Z',
				updated_at: '2026-02-27T10:30:00.000Z'
			}]
		});

		const query_builder = new QueryBuilder({
			schema_instance: null,
			model_options: {table_name: 'users', data_column: 'data'}
		}, 'find', {user_name: 'john'}, null);

		const result = await query_builder.exec();

		expect(result).toEqual([{
			id: '5',
			created_at: '2026-02-27T10:00:00.000Z',
			updated_at: '2026-02-27T10:30:00.000Z'
		}]);
	});
});
