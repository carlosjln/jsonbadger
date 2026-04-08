import {afterAll, beforeAll, describe, expect, test} from '@jest/globals';

import jsonbadger from '#src/index.js';
import {is_uuid_v7} from '#src/utils/value.js';
import {
	build_test_table_name,
	connect_local_jsonbadger,
	disconnect_connection,
	drop_table_if_exists
} from '#test/integration/postgres/helpers.js';

describe('Table ID strategy integration (local PostgreSQL)', function () {
	let connection;

	beforeAll(async function setup_database() {
		connection = await connect_local_jsonbadger(jsonbadger, {
			id_strategy: jsonbadger.ID_STRATEGY.uuidv7
		});
	});

	afterAll(async function teardown_database() {
		await disconnect_connection(connection);
	});

	test('uses server default uuidv7 and model override bigserial', async function () {
		const uuid_table_name = build_test_table_name('jsonbadger_id_strategy_test', 'uuid');
		const bigserial_table_name = build_test_table_name('jsonbadger_id_strategy_test', 'bigserial');

		const shared_schema = new jsonbadger.Schema({
			name: {type: String, required: true}
		});

		const uuid_model = connection.model({
			name: 'UuidModel_' + uuid_table_name,
			schema: shared_schema,
			table_name: uuid_table_name
		});

		const bigserial_model = connection.model({
			name: 'BigserialModel_' + bigserial_table_name,
			schema: shared_schema,
			table_name: bigserial_table_name,
			id_strategy: jsonbadger.ID_STRATEGY.bigserial
		});

		try {
			await drop_table_if_exists(connection, uuid_table_name);
			await drop_table_if_exists(connection, bigserial_table_name);

			expect(uuid_model.resolve_id_strategy()).toBe(jsonbadger.ID_STRATEGY.uuidv7);
			expect(bigserial_model.resolve_id_strategy()).toBe(jsonbadger.ID_STRATEGY.bigserial);

			await uuid_model.from({name: 'alpha'}).save();
			await bigserial_model.from({name: 'beta'}).save();

			const uuid_row_result = await connection.pool_instance.query(
				'SELECT id, pg_typeof(id)::text AS id_type FROM "' + uuid_table_name + '" LIMIT 1;'
			);

			const bigserial_row_result = await connection.pool_instance.query(
				'SELECT id, pg_typeof(id)::text AS id_type FROM "' + bigserial_table_name + '" LIMIT 1;'
			);

			expect(uuid_row_result.rows).toHaveLength(1);
			expect(uuid_row_result.rows[0].id_type).toBe('uuid');
			expect(is_uuid_v7(uuid_row_result.rows[0].id)).toBe(true);

			expect(bigserial_row_result.rows).toHaveLength(1);
			expect(bigserial_row_result.rows[0].id_type).toBe('bigint');
			expect(String(bigserial_row_result.rows[0].id)).toMatch(/^\d+$/);
		} finally {
			await drop_table_if_exists(connection, uuid_table_name);
			await drop_table_if_exists(connection, bigserial_table_name);
		}
	});
});
