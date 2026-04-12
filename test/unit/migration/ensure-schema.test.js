import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const ensure_index_mock = jest.fn();
const resolve_schema_indexes_mock = jest.fn();
const ensure_table_mock = jest.fn();

jest.unstable_mockModule('#src/migration/ensure-index.js', function () {
	return {
		default: ensure_index_mock
	};
});

jest.unstable_mockModule('#src/migration/schema-indexes-resolver.js', function () {
	return {
		default: resolve_schema_indexes_mock
	};
});

jest.unstable_mockModule('#src/migration/ensure-table.js', function () {
	return {
		default: ensure_table_mock
	};
});

const {default: ensure_schema} = await import('#src/migration/ensure-schema.js');

describe('ensure_schema', function () {
	beforeEach(function reset_test_state() {
		ensure_index_mock.mockReset();
		resolve_schema_indexes_mock.mockReset();
		ensure_table_mock.mockReset();
		ensure_index_mock.mockResolvedValue(undefined);
		ensure_table_mock.mockResolvedValue(undefined);
	});

	test('ensures table and skips index creation when schema has no declared indexes', async function () {
		const schema_value = {name: 'schema'};
		const identity_runtime = {column_sql: 'id UUID PRIMARY KEY DEFAULT uuidv7()'};
		resolve_schema_indexes_mock.mockReturnValue([]);

		await ensure_schema('users', 'data', schema_value, identity_runtime);

		expect(ensure_table_mock).toHaveBeenCalledTimes(1);
		expect(ensure_table_mock).toHaveBeenCalledWith({
			table_name: 'users',
			data_column: 'data',
			identity_runtime,
			connection: undefined
		});
		expect(resolve_schema_indexes_mock).toHaveBeenCalledTimes(1);
		expect(resolve_schema_indexes_mock).toHaveBeenCalledWith(schema_value);
		expect(ensure_index_mock).not.toHaveBeenCalled();
		expect(ensure_table_mock.mock.invocationCallOrder[0]).toBeLessThan(resolve_schema_indexes_mock.mock.invocationCallOrder[0]);
	});

	test('ensures each declared schema index in order after ensuring table', async function () {
		const schema_indexes = [
			{using: 'btree', path: 'email', order: 1, unique: true},
			{using: 'gin', path: 'profile.city', name: 'idx_users_city_gin'}
		];
		const identity_runtime = {column_sql: 'id BIGSERIAL PRIMARY KEY'};

		resolve_schema_indexes_mock.mockReturnValue(schema_indexes);

		await ensure_schema('users', 'data', {schema: true}, identity_runtime);

		expect(ensure_table_mock).toHaveBeenCalledTimes(1);
		expect(resolve_schema_indexes_mock).toHaveBeenCalledTimes(1);
		expect(ensure_index_mock).toHaveBeenCalledTimes(2);
		expect(ensure_index_mock.mock.calls).toEqual([
			[{
				table_name: 'users',
				index_definition: {using: 'btree', path: 'email', order: 1, unique: true},
				data_column: 'data',
				connection: undefined
			}],
			[{
				table_name: 'users',
				index_definition: {using: 'gin', path: 'profile.city', name: 'idx_users_city_gin'},
				data_column: 'data',
				connection: undefined
			}]
		]);
		expect(ensure_table_mock.mock.invocationCallOrder[0]).toBeLessThan(ensure_index_mock.mock.invocationCallOrder[0]);
		expect(ensure_index_mock.mock.invocationCallOrder[0]).toBeLessThan(ensure_index_mock.mock.invocationCallOrder[1]);
	});

	test('forwards explicit connection context to ensure_table and ensure_index', async function () {
		const connection = {pool_instance: {query: jest.fn()}, options: {debug: false}};
		const identity_runtime = {column_sql: 'id BIGSERIAL PRIMARY KEY'};

		resolve_schema_indexes_mock.mockReturnValue([
			{using: 'gin', path: 'profile.city'}
		]);

		await ensure_schema('users', 'data', {schema: true}, identity_runtime, connection);

		expect(ensure_table_mock).toHaveBeenCalledWith({
			table_name: 'users',
			data_column: 'data',
			identity_runtime,
			connection
		});

		expect(ensure_index_mock).toHaveBeenCalledWith({
			table_name: 'users',
			index_definition: {using: 'gin', path: 'profile.city'},
			data_column: 'data',
			connection
		});
	});
});
