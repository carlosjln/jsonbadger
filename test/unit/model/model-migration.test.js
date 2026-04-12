import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const ensure_table_mock = jest.fn();
const ensure_index_mock = jest.fn();

jest.unstable_mockModule('#src/migration/ensure-table.js', function () {
	return {
		default: ensure_table_mock
	};
});

jest.unstable_mockModule('#src/migration/ensure-index.js', function () {
	return {
		default: ensure_index_mock
	};
});

const {default: Schema} = await import('#src/schema/schema.js');
const {default: model} = await import('#src/model/factory/index.js');

describe('Model migration lifecycle', function () {
	let connection;

	beforeEach(function () {
		ensure_table_mock.mockReset();
		ensure_index_mock.mockReset();

		ensure_table_mock.mockResolvedValue(undefined);
		ensure_index_mock.mockResolvedValue(undefined);
		connection = {
			pool_instance: {query: jest.fn()},
			options: {debug: false},
			server_capabilities: {
				server_version: '18.0',
				server_version_num: 180000,
				supports_uuidv7: true
			}
		};
	});

	test('ensure_model creates the table and applies schema indexes when auto_index is enabled', async function () {
		const User = model('User', new Schema({
			name: {
				type: String,
				index: true
			}
		}), {
			table_name: 'users'
		}, connection);

		await User.ensure_model();

		expect(ensure_table_mock).toHaveBeenCalledWith({
			table_name: 'users',
			data_column: 'data',
			identity_runtime: {
				type: 'bigint',
				format: null,
				mode: 'database',
				id_strategy: 'bigserial',
				requires_explicit_id: false,
				column_sql: 'id BIGSERIAL PRIMARY KEY'
			},
			connection
		});
		expect(ensure_index_mock).toHaveBeenCalledWith({
			table_name: 'users',
			index_definition: {using: 'gin', path: 'name'},
			data_column: 'data',
			connection
		});
	});

	test('ensure_model skips schema indexes when auto_index is disabled', async function () {
		const User = model('User', new Schema({
			name: {
				type: String,
				index: true
			}
		}, {
			auto_index: false
		}), {
			table_name: 'users'
		}, connection);

		await User.ensure_model();

		expect(ensure_table_mock).toHaveBeenCalledTimes(1);
		expect(ensure_index_mock).not.toHaveBeenCalled();
	});

	test('ensure_indexes runs once until reset_index_cache is called', async function () {
		const User = model('User', new Schema({
			name: {
				type: String,
				index: true
			}
		}), {
			table_name: 'users'
		}, connection);

		await User.ensure_indexes();
		await User.ensure_indexes();
		expect(ensure_index_mock).toHaveBeenCalledTimes(1);

		User.reset_index_cache();
		await User.ensure_indexes();
		expect(ensure_index_mock).toHaveBeenCalledTimes(2);
	});

	test('ensure_table forwards the bound uuid database runtime when the schema selects native uuidv7 ids', async function () {
		const Event = model('Event', new Schema({
			name: String
		}, {
			identity: {
				type: 'uuid',
				format: 'uuidv7',
				mode: 'database'
			}
		}), {
			table_name: 'events'
		}, connection);

		await Event.ensure_table();

		expect(ensure_table_mock).toHaveBeenCalledWith({
			table_name: 'events',
			data_column: 'data',
			identity_runtime: {
				type: 'uuid',
				format: 'uuidv7',
				mode: 'database',
				id_strategy: 'uuidv7',
				requires_explicit_id: false,
				column_sql: 'id UUID PRIMARY KEY DEFAULT uuidv7()'
			},
			connection
		});
	});
});
