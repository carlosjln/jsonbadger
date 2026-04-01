import {beforeEach, describe, expect, jest, test} from '@jest/globals';
import ModelOverwriteError from '#src/errors/model-overwrite-error.js';

const debug_logger_mock = jest.fn();
const model_factory_mock = jest.fn();

jest.unstable_mockModule('#src/debug/debug-logger.js', function () {
	return {
		default: debug_logger_mock
	};
});

jest.unstable_mockModule('#src/model/factory/index.js', function () {
	return {
		default: model_factory_mock
	};
});

const {default: Connection} = await import('#src/connection/connection.js');

function create_schema() {
	return {
		validate: jest.fn()
	};
}

function create_connection(options = {}, server_capabilities = null, pool_instance = {}) {
	return new Connection(pool_instance, options, server_capabilities);
}

describe('Connection', function () {
	beforeEach(function () {
		debug_logger_mock.mockReset();
		model_factory_mock.mockReset();

		model_factory_mock.mockImplementation(function (model_name, schema_instance, model_options, connection) {
			function Model() {
			}

			Model.schema = schema_instance;
			Model.options = model_options;
			Model.connection = connection;
			Model.model_name = model_name;

			return Model;
		});
	});

	describe('constructor', function () {
		test('stores pool, normalized options, capabilities, and an empty model registry', function () {
			const pool_instance = {};
			const server_capabilities = {supports_uuidv7: true};
			const connection = create_connection({debug: true}, server_capabilities, pool_instance);

			expect(connection.pool_instance).toBe(pool_instance);
			expect(connection.options.debug).toBe(true);
			expect(connection.options.auto_index).toBeUndefined();
			expect(connection.server_capabilities).toBe(server_capabilities);
			expect(connection.models).toEqual({});
		});
	});

	describe('model registration', function () {
		test('registers a model by name on the connection', function () {
			const schema_instance = create_schema();
			const connection = create_connection();
			const registered_model = connection.model({
				name: 'User',
				schema: schema_instance,
				table_name: 'users'
			});

			expect(connection.models.User).toBe(registered_model);
			expect(model_factory_mock).toHaveBeenCalledWith(
				'User',
				schema_instance,
				expect.objectContaining({
					table_name: 'users'
				}),
				connection
			);
		});

		test('derives table_name from the model name when omitted', function () {
			const schema_instance = create_schema();
			const connection = create_connection();

			connection.model({
				name: 'User',
				schema: schema_instance
			});

			connection.model({
				name: 'Company',
				schema: schema_instance
			});

			expect(model_factory_mock).toHaveBeenNthCalledWith(
				1,
				'User',
				schema_instance,
				expect.objectContaining({
					table_name: 'users'
				}),
				connection
			);

			expect(model_factory_mock).toHaveBeenNthCalledWith(
				2,
				'Company',
				schema_instance,
				expect.objectContaining({
					table_name: 'companies'
				}),
				connection
			);
		});

		test('returns the existing model when the same definition is registered twice', function () {
			const schema_instance = create_schema();
			const connection = create_connection();

			const first_model = connection.model({
				name: 'User',
				schema: schema_instance
			});

			const second_model = connection.model({
				name: 'User',
				schema: schema_instance
			});

			expect(second_model).toBe(first_model);
			expect(connection.models.User).toBe(first_model);
			expect(model_factory_mock).toHaveBeenCalledTimes(1);
		});

		test('returns the existing model when explicit and derived table_name resolve to the same value', function () {
			const schema_instance = create_schema();
			const connection = create_connection();

			const first_model = connection.model({
				name: 'User',
				schema: schema_instance
			});

			const second_model = connection.model({
				name: 'User',
				schema: schema_instance,
				table_name: 'users'
			});

			expect(second_model).toBe(first_model);
			expect(model_factory_mock).toHaveBeenCalledTimes(1);
		});

		test('throws ModelOverwriteError when the same name is registered with a different schema', function () {
			const first_schema = create_schema();
			const second_schema = create_schema();
			const connection = create_connection();

			connection.model({
				name: 'User',
				schema: first_schema
			});

			expect(function () {
				connection.model({
					name: 'User',
					schema: second_schema
				});
			}).toThrow(new ModelOverwriteError('model "User" is already registered with a different schema', {
				name: 'User'
			}));
		});

		test('throws ModelOverwriteError when the same name is registered with different resolved options', function () {
			const schema_instance = create_schema();
			const connection = create_connection();

			connection.model({
				name: 'User',
				schema: schema_instance,
				table_name: 'users'
			});

			expect(function () {
				connection.model({
					name: 'User',
					schema: schema_instance,
					table_name: 'app_users'
				});
			}).toThrow(new ModelOverwriteError('model "User" is already registered with different model options', {
				name: 'User'
			}));
		});
	});

	describe('disconnect', function () {
		test('disconnect closes the pool and emits the debug event', async function () {
			const pool_instance = {
				end: jest.fn().mockResolvedValue(undefined)
			};
			const connection = create_connection({debug: true}, null, pool_instance);

			await connection.disconnect();

			expect(pool_instance.end).toHaveBeenCalledTimes(1);
			expect(debug_logger_mock).toHaveBeenCalledWith(true, 'connection_closed', null);
		});

		test('disconnect is a no-op when the pool has no end method', async function () {
			const connection = create_connection({debug: true});

			await connection.disconnect();

			expect(debug_logger_mock).not.toHaveBeenCalled();
		});
	});
});
