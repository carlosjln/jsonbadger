import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const sql_runner_mock = jest.fn();

jest.unstable_mockModule('#src/sql/sql-runner.js', function build_sql_runner_mock() {
	return {
		default: sql_runner_mock
	};
});

const {default: ensure_index} = await import('#src/migration/ensure-index.js');

describe('ensure_index', function () {
	beforeEach(function reset_test_state() {
		sql_runner_mock.mockReset();
		sql_runner_mock.mockResolvedValue({rows: []});
	});

	test('creates a GIN index for single-path index spec', async function () {
		await ensure_index('users', {
			using: 'gin',
			path: 'profile.city'
		}, 'data');

		expect(sql_runner_mock).toHaveBeenCalledTimes(1);
		expect(sql_runner_mock.mock.calls[0][0]).toContain('CREATE INDEX IF NOT EXISTS');
		expect(sql_runner_mock.mock.calls[0][0]).toContain('USING GIN');
		expect(sql_runner_mock.mock.calls[0][0]).toContain('"data" #>');
		expect(sql_runner_mock.mock.calls[0][1]).toEqual([]);
	});

	test('creates a GIN index single-segment expression with -> path extraction', async function () {
		await ensure_index('users', {
			using: 'gin',
			path: 'name'
		}, 'data');

		expect(sql_runner_mock).toHaveBeenCalledTimes(1);
		expect(sql_runner_mock.mock.calls[0][0]).toContain("\"data\" -> 'name'");
	});

	test('creates a compound BTREE index for object index spec', async function () {
		await ensure_index('users', {
			using: 'btree',
			paths: {name: 1, type: -1}
		}, 'data');

		expect(sql_runner_mock).toHaveBeenCalledTimes(1);
		expect(sql_runner_mock.mock.calls[0][0]).toContain('CREATE INDEX IF NOT EXISTS');
		expect(sql_runner_mock.mock.calls[0][0]).toContain('("data" ->> \'name\') ASC');
		expect(sql_runner_mock.mock.calls[0][0]).toContain('("data" ->> \'type\') DESC');
		expect(sql_runner_mock.mock.calls[0][1]).toEqual([]);
	});

	test('creates compound BTREE nested-path expressions with #>>', async function () {
		await ensure_index('users', {
			using: 'btree',
			paths: {'profile.city': 1}
		}, 'data');

		expect(sql_runner_mock).toHaveBeenCalledTimes(1);
		expect(sql_runner_mock.mock.calls[0][0]).toContain('\"data\" #>>');
	});

	test('supports unique compound indexes', async function () {
		await ensure_index('users', {
			using: 'btree',
			path: 'email',
			unique: true,
			name: 'idx_users_email_unique'
		}, 'data');

		expect(sql_runner_mock).toHaveBeenCalledTimes(1);
		expect(sql_runner_mock.mock.calls[0][0]).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "idx_users_email_unique"');
	});

	test('defaults unsupported single-path BTREE order values to ASC', async function () {
		await ensure_index('users', {
			using: 'btree',
			path: 'name',
			order: 0
		}, 'data');

		expect(sql_runner_mock).toHaveBeenCalledTimes(1);
		expect(sql_runner_mock.mock.calls[0][0]).toContain('("data" ->> \'name\') ASC');
	});

	test('ignores unique flag for GIN indexes and still creates GIN SQL', async function () {
		await ensure_index('users', {
			using: 'gin',
			path: 'name',
			unique: true
		}, 'data');

		expect(sql_runner_mock).toHaveBeenCalledTimes(1);
		expect(sql_runner_mock.mock.calls[0][0]).toContain('CREATE INDEX IF NOT EXISTS');
		expect(sql_runner_mock.mock.calls[0][0]).toContain('USING GIN');
		expect(sql_runner_mock.mock.calls[0][0]).not.toContain('CREATE UNIQUE INDEX');
	});
});
