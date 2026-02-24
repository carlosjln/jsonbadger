import {afterAll, beforeAll, describe, expect, test} from '@jest/globals';

import jsonbadger from '#src/index.js';
import {quote_identifier} from '#src/utils/assert.js';
import local_env_config from '#test/config/local-env-config.js';

const uuidv7_pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('Table ID strategy integration (local PostgreSQL)', function () {
	let pool_instance;
	let pg_config;
	let jb_config;

	beforeAll(async function setup_database() {
		const env_config = local_env_config();
		pg_config = env_config.postgres;
		jb_config = env_config.jsonbadger;

		pool_instance = await jsonbadger.connect(pg_config.uri, {
			debug: jb_config.debug,
			max: pg_config.pool_max,
			ssl: pg_config.ssl,
			id_strategy: jsonbadger.IdStrategies.uuidv7
		});
	});

	afterAll(async function teardown_database() {
		if(pool_instance) {
			await jsonbadger.disconnect();
		}
	});

	test('uses server default uuidv7 and model override bigserial', async function () {
		const uuid_table_name = build_test_table_name('uuid');
		const bigserial_table_name = build_test_table_name('bigserial');
		const uuid_table_identifier = quote_identifier(uuid_table_name);
		const bigserial_table_identifier = quote_identifier(bigserial_table_name);

		const shared_schema = new jsonbadger.Schema({
			name: {type: String, required: true}
		});

		const uuid_model = jsonbadger.model(shared_schema, {
			table_name: uuid_table_name
		});

		const bigserial_model = jsonbadger.model(shared_schema, {
			table_name: bigserial_table_name,
			id_strategy: jsonbadger.IdStrategies.bigserial
		});

		try {
			await pool_instance.query('DROP TABLE IF EXISTS ' + uuid_table_identifier + ';');
			await pool_instance.query('DROP TABLE IF EXISTS ' + bigserial_table_identifier + ';');

			expect(uuid_model.resolve_id_strategy()).toBe(jsonbadger.IdStrategies.uuidv7);
			expect(bigserial_model.resolve_id_strategy()).toBe(jsonbadger.IdStrategies.bigserial);

			await new uuid_model({name: 'alpha'}).save();
			await new bigserial_model({name: 'beta'}).save();

			const uuid_row_result = await pool_instance.query(
				'SELECT id, pg_typeof(id)::text AS id_type FROM ' + uuid_table_identifier + ' LIMIT 1;'
			);

			const bigserial_row_result = await pool_instance.query(
				'SELECT id, pg_typeof(id)::text AS id_type FROM ' + bigserial_table_identifier + ' LIMIT 1;'
			);

			expect(uuid_row_result.rows).toHaveLength(1);
			expect(uuid_row_result.rows[0].id_type).toBe('uuid');
			expect(uuid_row_result.rows[0].id).toMatch(uuidv7_pattern);

			expect(bigserial_row_result.rows).toHaveLength(1);
			expect(bigserial_row_result.rows[0].id_type).toBe('bigint');
			expect(String(bigserial_row_result.rows[0].id)).toMatch(/^\d+$/);
		} finally {
			if(pool_instance) {
				await pool_instance.query('DROP TABLE IF EXISTS ' + uuid_table_identifier + ';');
				await pool_instance.query('DROP TABLE IF EXISTS ' + bigserial_table_identifier + ';');
			}
		}
	});
});

function build_test_table_name(suffix_value) {
	const random_suffix = String(Math.floor(Math.random() * 1000000));
	const timestamp = Date.now();

	return 'jsonbadger_id_strategy_test_' + suffix_value + '_' + timestamp + '_' + random_suffix;
}
