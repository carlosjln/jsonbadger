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

describe('PostgreSQL JSON update function SQL generation', function () {
	beforeEach(function () {
		ensure_table_mock.mockReset();
		sql_runner_mock.mockReset();
		sql_runner_mock.mockResolvedValue({rows: [{data: {ok: true}}]});

		connection_options_state.id_strategy = 'bigserial';
		connection_options_state.auto_index = false;
	});

	test('maps $set to jsonb_set with create-missing enabled', async function () {
		const user_model = create_test_model();

		await user_model.update_one({}, {
			$set: {
				'payload.audit.created_by': 'system'
			}
		});

		const sql_text = sql_runner_mock.mock.calls[0][0];
		const sql_params = sql_runner_mock.mock.calls[0][1];

		expect(sql_text).toContain('jsonb_set(');
		expect(sql_text).toContain("'{payload,audit,created_by}'");
		expect(sql_text).toContain(', true)');
		expect(sql_params).toEqual(['"system"']);
	});

	test('maps $insert to jsonb_insert and preserves insert_after default false', async function () {
		const user_model = create_test_model();

		await user_model.update_one({}, {
			$insert: {
				'tags.1': 'beta'
			}
		});

		const sql_text = sql_runner_mock.mock.calls[0][0];
		const sql_params = sql_runner_mock.mock.calls[0][1];

		expect(sql_text).toContain('jsonb_insert(');
		expect(sql_text).toContain("'{tags,1}'");
		expect(sql_text).toContain(', false)');
		expect(sql_params).toEqual(['"beta"']);
	});

	test('maps $set_lax to jsonb_set_lax with default null handling semantics', async function () {
		const user_model = create_test_model();

		await user_model.update_one({}, {
			$set_lax: {
				'payload.optional': {
					value: null
				}
			}
		});

		const sql_text = sql_runner_mock.mock.calls[0][0];
		const sql_params = sql_runner_mock.mock.calls[0][1];

		expect(sql_text).toContain('jsonb_set_lax(');
		expect(sql_text).toContain("'{payload,optional}'");
		expect(sql_text).toContain(", true, 'use_json_null')");
		expect(sql_params).toEqual([null]);
	});

	test('maps $set_lax custom null treatment and create_if_missing options', async function () {
		const user_model = create_test_model();

		await user_model.update_one({}, {
			$set_lax: {
				'payload.optional': {
					value: null,
					create_if_missing: false,
					null_value_treatment: 'return_target'
				}
			}
		});

		const sql_text = sql_runner_mock.mock.calls[0][0];
		const sql_params = sql_runner_mock.mock.calls[0][1];

		expect(sql_text).toContain('jsonb_set_lax(');
		expect(sql_text).toContain(", false, 'return_target')");
		expect(sql_params).toEqual([null]);
	});
});

function create_test_model() {
	const schema_instance = new Schema({
		tags: [String],
		payload: {}
	});

	return model(schema_instance, {
		table_name: 'users'
	});
}
