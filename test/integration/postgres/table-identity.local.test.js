import {afterAll, beforeAll, describe, expect, test} from '@jest/globals';

import jsonbadger from '#src/index.js';
import {is_uuid_v7} from '#src/utils/value.js';
import {
	build_test_table_name,
	connect_local_jsonbadger,
	disconnect_connection,
	drop_table_if_exists
} from '#test/integration/postgres/helpers.js';

describe('Table identity integration (local PostgreSQL)', function () {
	let connection;

	beforeAll(async function setup_database() {
		connection = await connect_local_jsonbadger(jsonbadger);
	});

	afterAll(async function teardown_database() {
		await disconnect_connection(connection);
	});

	test('uses identity-selected uuidv7 and default bigint identities', async function () {
		const uuid_table_name = build_test_table_name('jsonbadger_identity_test', 'uuid');
		const bigserial_table_name = build_test_table_name('jsonbadger_identity_test', 'bigint');
		const uuid_generator = function uuid_generator() {
			return '019631f7-ef80-7c17-8cf0-a9b241551111';
		};

		const uuid_schema = new jsonbadger.Schema({
			name: {type: String, required: true}
		}, {
			identity: {
				type: jsonbadger.IDENTITY_TYPE.uuid,
				format: jsonbadger.IDENTITY_FORMAT.uuidv7,
				mode: jsonbadger.IDENTITY_MODE.fallback,
				generator: uuid_generator
			}
		});
		const bigserial_schema = new jsonbadger.Schema({
			name: {type: String, required: true}
		});

		const uuid_model = connection.model({
			name: 'UuidModel_' + uuid_table_name,
			schema: uuid_schema,
			table_name: uuid_table_name
		});

		const bigserial_model = connection.model({
			name: 'BigserialModel_' + bigserial_table_name,
			schema: bigserial_schema,
			table_name: bigserial_table_name
		});

		try {
			await drop_table_if_exists(connection, uuid_table_name);
			await drop_table_if_exists(connection, bigserial_table_name);

			expect(uuid_model.schema.options.identity).toEqual({
				type: jsonbadger.IDENTITY_TYPE.uuid,
				format: jsonbadger.IDENTITY_FORMAT.uuidv7,
				mode: jsonbadger.IDENTITY_MODE.fallback,
				generator: uuid_generator
			});
			expect(bigserial_model.schema.options.identity).toEqual({
				type: jsonbadger.IDENTITY_TYPE.bigint,
				format: null,
				mode: jsonbadger.IDENTITY_MODE.fallback,
				generator: null
			});
			expect(uuid_model.schema.$runtime.identity.type).toBe(jsonbadger.IDENTITY_TYPE.uuid);
			expect(bigserial_model.schema.$runtime.identity.type).toBe(jsonbadger.IDENTITY_TYPE.bigint);

			await uuid_model.ensure_table();
			await bigserial_model.ensure_table();

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
