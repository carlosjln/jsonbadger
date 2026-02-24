import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const sql_runner_mock = jest.fn();

jest.unstable_mockModule('#src/sql/sql-runner.js', function build_sql_runner_mock() {
	return {
		default: sql_runner_mock
	};
});

const {default: ensure_table} = await import('#src/migration/ensure-table.js');

describe('ensure_table id strategy', function () {
	beforeEach(function reset_test_state() {
		sql_runner_mock.mockReset();
		sql_runner_mock.mockResolvedValue({rows: []});
	});

	test('creates BIGSERIAL primary key for bigserial strategy', async function () {
		await ensure_table('users', 'data', 'bigserial');

		expect(sql_runner_mock).toHaveBeenCalledTimes(1);
		expect(sql_runner_mock.mock.calls[0][0]).toContain('id BIGSERIAL PRIMARY KEY');
		expect(sql_runner_mock.mock.calls[0][0]).toContain('"data" JSONB NOT NULL');
		expect(sql_runner_mock.mock.calls[0][1]).toEqual([]);
	});

	test('creates UUID primary key with database uuidv7() default for uuidv7 strategy', async function () {
		await ensure_table('sessions', 'payload', 'uuidv7');

		expect(sql_runner_mock).toHaveBeenCalledTimes(1);
		expect(sql_runner_mock.mock.calls[0][0]).toContain('id UUID PRIMARY KEY DEFAULT uuidv7()');
		expect(sql_runner_mock.mock.calls[0][0]).toContain('"payload" JSONB NOT NULL');
		expect(sql_runner_mock.mock.calls[0][1]).toEqual([]);
	});

	test('throws when id_strategy is omitted', async function () {
		await expect(ensure_table('logs', 'data')).rejects.toThrow('id_strategy must be one of: bigserial, uuidv7');
	});

	test('throws for unsupported id_strategy values', async function () {
		await expect(ensure_table('audit', 'data', 'uuid')).rejects.toThrow(
			'id_strategy must be one of: bigserial, uuidv7'
		);
	});
});
