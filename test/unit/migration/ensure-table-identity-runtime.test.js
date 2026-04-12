import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const sql_runner_mock = jest.fn();

jest.unstable_mockModule('#src/sql/run.js', function build_sql_runner_mock() {
	return {
		default: sql_runner_mock
	};
});

const {default: ensure_table} = await import('#src/migration/ensure-table.js');

describe('ensure_table identity runtime', function () {
	beforeEach(function reset_test_state() {
		sql_runner_mock.mockReset();
		sql_runner_mock.mockResolvedValue({rows: []});
	});

	test('creates BIGSERIAL primary key for bigint database runtime', async function () {
		await ensure_table({
			table_name: 'users',
			data_column: 'data',
			identity_runtime: {
				column_sql: 'id BIGSERIAL PRIMARY KEY'
			}
		});

		expect(sql_runner_mock).toHaveBeenCalledTimes(1);
		expect(sql_runner_mock.mock.calls[0][0]).toContain('id BIGSERIAL PRIMARY KEY');
		expect(sql_runner_mock.mock.calls[0][0]).toContain('"data" JSONB NOT NULL');
		expect(sql_runner_mock.mock.calls[0][1]).toEqual([]);
	});

	test('creates UUID primary key with native uuidv7() default for database runtime', async function () {
		await ensure_table({
			table_name: 'sessions',
			data_column: 'payload',
			identity_runtime: {
				column_sql: 'id UUID PRIMARY KEY DEFAULT uuidv7()'
			}
		});

		expect(sql_runner_mock).toHaveBeenCalledTimes(1);
		expect(sql_runner_mock.mock.calls[0][0]).toContain('id UUID PRIMARY KEY DEFAULT uuidv7()');
		expect(sql_runner_mock.mock.calls[0][0]).toContain('"payload" JSONB NOT NULL');
		expect(sql_runner_mock.mock.calls[0][1]).toEqual([]);
	});

	test('creates UUID primary key without a database default for application runtime', async function () {
		await ensure_table({
			table_name: 'sessions',
			data_column: 'payload',
			identity_runtime: {
				column_sql: 'id UUID PRIMARY KEY'
			}
		});

		expect(sql_runner_mock).toHaveBeenCalledTimes(1);
		expect(sql_runner_mock.mock.calls[0][0]).toContain('id UUID PRIMARY KEY, "payload" JSONB NOT NULL');
		expect(sql_runner_mock.mock.calls[0][1]).toEqual([]);
	});

	test('forwards explicit connection context to sql_runner when provided', async function () {
		const connection = {pool_instance: {query: jest.fn()}, options: {debug: false}};

		await ensure_table({
			table_name: 'users',
			data_column: 'data',
			identity_runtime: {
				column_sql: 'id BIGSERIAL PRIMARY KEY'
			},
			connection
		});

		expect(sql_runner_mock).toHaveBeenCalledWith(expect.any(String), [], connection);
	});
});
