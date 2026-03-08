import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const debug_logger_mock = jest.fn();
const model_factory_mock = jest.fn();

jest.unstable_mockModule('#src/debug/debug-logger.js', function () {
	return {
		default: debug_logger_mock
	};
});

jest.unstable_mockModule('#src/model/model-factory.js', function () {
	return {
		default: model_factory_mock
	};
});

const {default: Connection} = await import('#src/connection/connection.js');

describe('Connection', function () {
	beforeEach(function () {
		debug_logger_mock.mockReset();
		model_factory_mock.mockReset();
	});

	test('stores pool, normalized options, capabilities, and an empty model registry', function () {
		const pool_instance = {};
		const server_capabilities = {supports_uuidv7: true};
		const connection = new Connection(pool_instance, {debug: true}, server_capabilities);

		expect(connection.pool_instance).toBe(pool_instance);
		expect(connection.options.debug).toBe(true);
		expect(connection.options.auto_index).toBe(true);
		expect(connection.server_capabilities).toBe(server_capabilities);
		expect(connection.models).toEqual({});
	});

	test('registers a model by name on the connection', function () {
		const schema_instance = {validate: jest.fn()};
		const Model = function () {
		};

		model_factory_mock.mockReturnValue(Model);

		const connection = new Connection({}, {}, null);
		const registered_model = connection.model({
			name: 'User',
			schema: schema_instance,
			table_name: 'users'
		});

		expect(registered_model).toBe(Model);
		expect(connection.models.User).toBe(Model);
		expect(model_factory_mock).toHaveBeenCalledWith(schema_instance, expect.objectContaining({
			table_name: 'users'
		}));
		expect(Model.connection).toBe(connection);
		expect(Model.connection_model_name).toBe('User');
	});

	test('derives table_name from the model name when omitted', function () {
		const schema_instance = {validate: jest.fn()};
		const User_model = function () {
		};
		const Company_model = function () {
		};

		model_factory_mock
			.mockReturnValueOnce(User_model)
			.mockReturnValueOnce(Company_model);

		const connection = new Connection({}, {}, null);

		connection.model({
			name: 'User',
			schema: schema_instance
		});

		connection.model({
			name: 'Company',
			schema: schema_instance
		});

		expect(model_factory_mock).toHaveBeenNthCalledWith(1, schema_instance, expect.objectContaining({
			table_name: 'users'
		}));

		expect(model_factory_mock).toHaveBeenNthCalledWith(2, schema_instance, expect.objectContaining({
			table_name: 'companies'
		}));
	});

	test('rejects duplicate model names on the same connection', function () {
		const schema_instance = {validate: jest.fn()};
		const Model = function () {
		};

		model_factory_mock.mockReturnValue(Model);

		const connection = new Connection({}, {}, null);

		connection.model({
			name: 'User',
			schema: schema_instance
		});

		expect(function () {
			connection.model({
				name: 'User',
				schema: schema_instance
			});
		}).toThrow('model "User" is already registered on this connection');
	});

	test('disconnect closes the pool and emits the debug event', async function () {
		const pool_instance = {
			end: jest.fn().mockResolvedValue(undefined)
		};
		const connection = new Connection(pool_instance, {debug: true}, null);

		await connection.disconnect();

		expect(pool_instance.end).toHaveBeenCalledTimes(1);
		expect(debug_logger_mock).toHaveBeenCalledWith(true, 'connection_closed', null);
	});

	test('disconnect is a no-op when the pool has no end method', async function () {
		const connection = new Connection({}, {debug: true}, null);

		await connection.disconnect();

		expect(debug_logger_mock).not.toHaveBeenCalled();
	});
});
