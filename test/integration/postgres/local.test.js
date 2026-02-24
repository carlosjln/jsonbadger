import {describe, expect, test, beforeAll, afterAll} from '@jest/globals';

import jsonbadger from '#src/index.js';
import {quote_identifier} from '#src/utils/assert.js';
import local_env_config from '#test/config/local-env-config.js';

// Constants to avoid magic strings and numbers
const TEST_CONSTANTS = {
	TABLE_PREFIX: 'jsonbadger_local_test_',
	USER_JOHN: 'john',
	CITY_MIAMI: 'Miami',
	CITY_ORLANDO: 'Orlando',
	TAG_ELECTRONICS: 'electronics',
	AGE_ADULT: 18,
	STATUS_PAID: 'paid',
	EXPENSIVE_ORDER_THRESHOLD: 10
};

describe('Local PostgreSQL integration', function () {
	let pool_instance;
	let pg_config;
	let jb_config;

	// Setup database connection before running tests
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

	// Cleanup database connection after tests
	afterAll(async function teardown_database() {
		if(pool_instance) {
			await jsonbadger.disconnect();
		}
	});

	test('runs the query and model flow end to end', async function () {
		const test_table_name = build_test_table_name();
		const table_identifier = quote_identifier(test_table_name);

		try {
			await pool_instance.query('DROP TABLE IF EXISTS ' + table_identifier + ';');

			// 1. Define Schema
			const user_schema = new jsonbadger.Schema({
				user_name: {type: String, required: true},
				age: {type: Number, min: 0},
				tags: [String],
				address: {city: String, country: String},
				orders: [Object]
			});

			user_schema.create_index('user_name');
			user_schema.create_index({'address.city': 1, age: -1});

			const user_model = jsonbadger.model(user_schema, {
				table_name: test_table_name,
				data_column: 'data'
			});

			// 2. Ensure Database Objects
			await user_model.ensure_table();
			await user_model.ensure_index();
			await user_model.ensure_schema();

			// 3. Create Documents
			const first_document = new user_model({
				user_name: TEST_CONSTANTS.USER_JOHN,
				age: 30,
				tags: [TEST_CONSTANTS.TAG_ELECTRONICS, 'gaming'],
				address: {city: TEST_CONSTANTS.CITY_MIAMI, country: 'US'},
				orders: [{price: 12.5, status: TEST_CONSTANTS.STATUS_PAID}]
			});

			const second_document = new user_model({
				user_name: 'jane',
				age: 22,
				tags: ['books'],
				address: {city: TEST_CONSTANTS.CITY_MIAMI, country: 'US'},
				orders: [{price: 8.2, status: TEST_CONSTANTS.STATUS_PAID}]
			});

			const third_document = new user_model({
				user_name: 'mark',
				age: 17,
				tags: [TEST_CONSTANTS.TAG_ELECTRONICS],
				address: {city: 'Tampa', country: 'US'},
				orders: [{price: 20, status: 'pending'}]
			});

			// 4. Save Documents
			const saved_first_document = await first_document.save();
			await second_document.save();
			await third_document.save();

			expect(saved_first_document.user_name).toBe(TEST_CONSTANTS.USER_JOHN);

			// 5. Query: Complex Find
			const adults_in_miami = await user_model.find({age: {$gte: TEST_CONSTANTS.AGE_ADULT}})
				.where({'address.city': TEST_CONSTANTS.CITY_MIAMI})
				.sort({age: -1})
				.limit(10)
				.skip(0)
				.exec();

			expect(adults_in_miami.length).toBe(2);
			expect(adults_in_miami[0].user_name).toBe(TEST_CONSTANTS.USER_JOHN);

			// 6. Query: Regex
			const regex_match = await user_model.find_one({
				user_name: {$regex: 'jo', $options: 'i'}
			}).exec();

			expect(regex_match.user_name).toBe(TEST_CONSTANTS.USER_JOHN);

			// 7. Query: Count Nested
			const expensive_order_count = await user_model.count_documents({
				'orders.price': {$gt: TEST_CONSTANTS.EXPENSIVE_ORDER_THRESHOLD}
			}).exec();

			expect(expensive_order_count).toBe(2);

			// 8. Query: Count Simple
			const tagged_count = await user_model.count_documents({
				tags: TEST_CONSTANTS.TAG_ELECTRONICS
			}).exec();

			expect(tagged_count).toBe(2);

			// 9. Update
			const updated_document = await user_model.update_one(
				{user_name: TEST_CONSTANTS.USER_JOHN},
				{$set: {age: 31, 'address.city': TEST_CONSTANTS.CITY_ORLANDO}}
			);

			expect(updated_document.age).toBe(31);
			expect(updated_document.address.city).toBe(TEST_CONSTANTS.CITY_ORLANDO);

			// 10. Verify Update
			const updated_lookup = await user_model.find_one({user_name: TEST_CONSTANTS.USER_JOHN}).exec();

			expect(updated_lookup.age).toBe(31);
			expect(updated_lookup.address.city).toBe(TEST_CONSTANTS.CITY_ORLANDO);

			// 11. Delete One
			const deleted_document = await user_model.delete_one({user_name: 'jane'});

			expect(deleted_document.user_name).toBe('jane');

			// 12. Verify Delete
			const deleted_lookup = await user_model.find_one({user_name: 'jane'}).exec();
			const after_delete_count = await user_model.count_documents({}).exec();

			expect(deleted_lookup).toBeNull();
			expect(after_delete_count).toBe(2);
		} finally {
			if(pool_instance) {
				await pool_instance.query('DROP TABLE IF EXISTS ' + table_identifier + ';');
			}
		}
	});
});

/**
 * Generates a unique table name for testing purposes to avoid collisions.
 * @returns {string} The generated table name.
 */
function build_test_table_name() {
	const random_suffix = String(Math.floor(Math.random() * 1000000));
	const timestamp = Date.now();

	return 'jsonbadger_local_test_' + timestamp + '_' + random_suffix;
}

