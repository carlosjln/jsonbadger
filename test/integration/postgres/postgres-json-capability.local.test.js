import {afterAll, beforeAll, describe, expect, test} from '@jest/globals';

import jsonbadger from '#src/index.js';
import {quote_identifier} from '#src/utils/assert.js';
import {has_own} from '#src/utils/object.js';
import local_env_config from '#test/config/local-env-config.js';

describe('PostgreSQL JSON capability alignment', function () {
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
			ssl: pg_config.ssl
		});
	});

	afterAll(async function teardown_database() {
		if(pool_instance) {
			await jsonbadger.disconnect();
		}
	});

	test('matches PostgreSQL JSON query and update semantics end to end', async function () {
		const test_table_name = build_test_table_name();
		const table_identifier = quote_identifier(test_table_name);
		let capability_model;

		try {
			await pool_instance.query('DROP TABLE IF EXISTS ' + table_identifier + ';');

			const capability_schema = new jsonbadger.Schema({
				user_name: String,
				tags: [String],
				payload: {}
			});

			capability_model = jsonbadger.model(capability_schema, {
				table_name: test_table_name,
				data_column: 'data'
			});

			await capability_model.ensure_table();

			await new capability_model({
				user_name: 'alpha',
				tags: ['one', 'three'],
				payload: {
					profile: {city: 'Miami', country: 'US'},
					flags: ['vip', 'beta'],
					items: [{sku: 'A1', qty: 2}, {sku: 'B2', qty: 0}],
					score: 42,
					text_value: 'abc',
					cleanup_flag: true
				}
			}).save();

			await new capability_model({
				user_name: 'beta',
				tags: ['two'],
				payload: {
					profile: {country: 'US'},
					flags: ['basic'],
					items: [{sku: 'C3', qty: 0}],
					score: 5,
					text_value: 'xyz'
				}
			}).save();

			// 1) Existence operators are top-level within the selected JSON scope.
			const has_profile = await capability_model.find({payload: {$has_key: 'profile'}}).sort({user_name: 1}).exec();
			const has_literal_dotted_key = await capability_model.find({payload: {$has_key: 'profile.city'}}).exec();
			const nested_profile_has_city = await capability_model.find({'payload.profile': {$has_key: 'city'}}).exec();

			expect(has_profile.map(function pick_user(row) {return row.user_name;})).toEqual(['alpha', 'beta']);
			expect(has_literal_dotted_key).toEqual([]);
			expect(nested_profile_has_city.map(function pick_user(row) {return row.user_name;})).toEqual(['alpha']);

			// 2) Containment semantics over nested objects and arrays use PostgreSQL @> behavior.
			const contains_nested_object = await capability_model.find({
				payload: {$contains: {profile: {city: 'Miami'}}}
			}).exec();
			const contains_nested_array = await capability_model.find({
				payload: {$contains: {flags: ['vip']}}
			}).exec();

			expect(contains_nested_object.map(function pick_user(row) {return row.user_name;})).toEqual(['alpha']);
			expect(contains_nested_array.map(function pick_user(row) {return row.user_name;})).toEqual(['alpha']);

			// 3) JSONPath operators work and suppress type/missing-path errors (PostgreSQL @? / @@ semantics).
			const jsonpath_exists_match = await capability_model.find({
				payload: {$json_path_exists: '$.items[*] ? (@.qty > 1)'}
			}).exec();
			const jsonpath_predicate_match = await capability_model.find({
				payload: {$json_path_match: '$.score > 10'}
			}).exec();
			const jsonpath_type_mismatch = await capability_model.find({
				payload: {$json_path_match: '$.text_value > 1'}
			}).exec();
			const jsonpath_missing_field = await capability_model.find({
				payload: {$json_path_exists: '$.missing.deep ? (@ > 0)'}
			}).exec();

			expect(jsonpath_exists_match.map(function pick_user(row) {return row.user_name;})).toEqual(['alpha']);
			expect(jsonpath_predicate_match.map(function pick_user(row) {return row.user_name;})).toEqual(['alpha']);
			expect(jsonpath_type_mismatch).toEqual([]);
			expect(jsonpath_missing_field).toEqual([]);

			// 4) Update-path edge cases: missing path creation, null treatment, and array insert positioning.
			const after_missing_path_create = await capability_model.update_one({user_name: 'alpha'}, {
				$set: {
					'payload.profile.state': 'FL'
				}
			});

			expect(after_missing_path_create.payload.profile.state).toBe('FL');

			const after_insert_before = await capability_model.update_one({user_name: 'alpha'}, {
				$insert: {
					'tags.0': 'zero'
				}
			});

			expect(after_insert_before.tags).toEqual(['zero', 'one', 'three']);

			const after_insert_after = await capability_model.update_one({user_name: 'alpha'}, {
				$insert: {
					'tags.0': {
						value: 'zero_plus',
						insert_after: true
					}
				}
			});

			expect(after_insert_after.tags).toEqual(['zero', 'zero_plus', 'one', 'three']);

			const after_delete_key = await capability_model.update_one({user_name: 'alpha'}, {
				$set_lax: {
					'payload.cleanup_flag': {
						value: null,
						null_value_treatment: 'delete_key'
					}
				}
			});

			expect(has_own(after_delete_key.payload, 'cleanup_flag')).toBe(false);

			const persisted_alpha = await capability_model.find_one({user_name: 'alpha'}).exec();
			expect(persisted_alpha.tags).toEqual(['zero', 'zero_plus', 'one', 'three']);
			expect(persisted_alpha.payload.profile.state).toBe('FL');
			expect(has_own(persisted_alpha.payload, 'cleanup_flag')).toBe(false);
		} finally {
			if(pool_instance) {
				await pool_instance.query('DROP TABLE IF EXISTS ' + table_identifier + ';');
			}
		}
	});
});

function build_test_table_name() {
	const random_suffix = String(Math.floor(Math.random() * 1000000));
	const timestamp = Date.now();

	return 'jsonbadger_pg_caps_test_' + timestamp + '_' + random_suffix;
}
