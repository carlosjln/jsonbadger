import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const ensure_table_mock = jest.fn();
const sql_runner_mock = jest.fn();
const connection_options_state = {
	id_strategy: 'bigserial',
	auto_index: false
};

jest.unstable_mockModule('#src/migration/ensure-table.js', function () {
	return {
		default: ensure_table_mock
	};
});

jest.unstable_mockModule('#src/sql/sql-runner.js', function () {
	return {
		default: sql_runner_mock
	};
});

jest.unstable_mockModule('#src/connection/pool-store.js', function () {
	return {
		get_connection_options: function () {
			return connection_options_state;
		},

		has_pool: function () {
			return false;
		},

		get_server_capabilities: function () {
			return null;
		}
	};
});

const {default: Schema} = await import('#src/schema/schema.js');
const {default: model} = await import('#src/model/model-factory.js');

describe('Model.update_one field type casting', function () {
	beforeEach(function () {
		ensure_table_mock.mockReset();
		sql_runner_mock.mockReset();
		sql_runner_mock.mockResolvedValue({rows: [{data: {ok: true}}]});
		connection_options_state.id_strategy = 'bigserial';
		connection_options_state.auto_index = false;
	});

	test('casts $set values before JSON serialization', async function () {
		const schema_instance = new Schema({
			active: Boolean,
			score: {type: 'Int32'},
			price: {type: 'Decimal128'}
		});
		const user_model = model(schema_instance, {
			table_name: 'users'
		});

		await user_model.update_one({}, {
			$set: {
				active: 'yes',
				score: '41',
				price: 12.5
			}
		});

		expect(ensure_table_mock).toHaveBeenCalledWith('users', 'data', 'bigserial');
		expect(sql_runner_mock).toHaveBeenCalledTimes(1);
		expect(sql_runner_mock.mock.calls[0][0]).toContain('jsonb_set');
		expect(sql_runner_mock.mock.calls[0][1]).toEqual(['true', '41', '"12.5"']);
	});

	test('serializes bigint values safely during $set updates', async function () {
		const schema_instance = new Schema({
			count64: {type: 'BigInt'}
		});
		const user_model = model(schema_instance, {
			table_name: 'users'
		});

		await user_model.update_one({}, {
			$set: {
				count64: '9007199254740993'
			}
		});

		expect(sql_runner_mock).toHaveBeenCalledTimes(1);
		expect(sql_runner_mock.mock.calls[0][1]).toEqual(['"9007199254740993"']);
	});

	test('supports $insert updates via jsonb_insert', async function () {
		const schema_instance = new Schema({
			tags: [String]
		});
		const user_model = model(schema_instance, {
			table_name: 'users'
		});

		await user_model.update_one({}, {
			$insert: {
				'tags.0': {
					value: 'vip',
					insert_after: true
				}
			}
		});

		expect(sql_runner_mock).toHaveBeenCalledTimes(1);
		expect(sql_runner_mock.mock.calls[0][0]).toContain('jsonb_insert');
		expect(sql_runner_mock.mock.calls[0][0]).toContain('true)');
		expect(sql_runner_mock.mock.calls[0][1]).toEqual(['"vip"']);
	});

	test('supports $set_lax updates via jsonb_set_lax and binds null values as SQL NULL', async function () {
		const schema_instance = new Schema({
			payload: {}
		});
		const user_model = model(schema_instance, {
			table_name: 'users'
		});

		await user_model.update_one({}, {
			$set_lax: {
				'payload.legacy': {
					value: null,
					null_value_treatment: 'delete_key',
					create_if_missing: false
				}
			}
		});

		expect(sql_runner_mock).toHaveBeenCalledTimes(1);
		expect(sql_runner_mock.mock.calls[0][0]).toContain('jsonb_set_lax');
		expect(sql_runner_mock.mock.calls[0][0]).toContain("'delete_key'");
		expect(sql_runner_mock.mock.calls[0][0]).toContain(', false,');
		expect(sql_runner_mock.mock.calls[0][1]).toEqual([null]);
	});

	test('applies $set, $insert, and $set_lax in a deterministic nested expression order', async function () {
		const schema_instance = new Schema({
			active: Boolean,
			tags: [String],
			payload: {}
		});
		const user_model = model(schema_instance, {
			table_name: 'users'
		});

		await user_model.update_one({}, {
			$set: {active: 'yes'},
			$insert: {'tags.0': 'first'},
			$set_lax: {'payload.notes': 'ok'}
		});

		const sql_text = sql_runner_mock.mock.calls[0][0];
		expect(sql_text.indexOf('jsonb_set_lax(')).toBeLessThan(sql_text.indexOf('jsonb_insert('));
		expect(sql_text.indexOf('jsonb_insert(')).toBeLessThan(sql_text.indexOf('jsonb_set('));
		expect(sql_runner_mock.mock.calls[0][1]).toEqual(['true', '"first"', '"ok"']);
	});

	test('rejects conflicting update paths across operators', async function () {
		const schema_instance = new Schema({
			payload: {}
		});
		const user_model = model(schema_instance, {
			table_name: 'users'
		});

		await expect(user_model.update_one({}, {
			$set: {
				payload: {nested: true}
			},
			$set_lax: {
				'payload.value': 'ok'
			}
		})).rejects.toThrow('Conflicting update paths');

		expect(sql_runner_mock).not.toHaveBeenCalled();
	});

	test('rejects invalid $set_lax null_value_treatment', async function () {
		const schema_instance = new Schema({
			payload: {}
		});
		const user_model = model(schema_instance, {
			table_name: 'users'
		});

		await expect(user_model.update_one({}, {
			$set_lax: {
				'payload.value': {
					value: null,
					null_value_treatment: 'drop_it'
				}
			}
		})).rejects.toThrow('$set_lax.null_value_treatment');
	});

	test('propagates field cast errors for invalid $set values', async function () {
		const schema_instance = new Schema({
			score: {type: 'Int32'}
		});
		const user_model = model(schema_instance, {
			table_name: 'users'
		});

		await expect(user_model.update_one({}, {
			$set: {
				score: '2147483648'
			}
		})).rejects.toThrow('Cast to Int32 failed');
	});
});
