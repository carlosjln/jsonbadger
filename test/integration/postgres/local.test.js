import {afterAll, beforeAll, describe, expect, test} from '@jest/globals';

import jsonbadger from '#src/index.js';
import {quote_identifier} from '#src/utils/assert.js';
import local_env_config from '#test/config/local-env-config.js';

describe('Local PostgreSQL integration', function () {
	let connection;
	let pg_config;
	let jb_config;

	beforeAll(async function setup_database() {
		const env_config = local_env_config();
		pg_config = env_config.postgres;
		jb_config = env_config.jsonbadger;

		connection = await jsonbadger.connect(pg_config.uri, {
			debug: jb_config.debug,
			max: pg_config.pool_max,
			ssl: pg_config.ssl
		});
	});

	afterAll(async function teardown_database() {
		if(connection) {
			await connection.disconnect();
		}
	});

	test('ensures schema objects and persists documents end to end', async function () {
		const test_table_name = build_test_table_name();
		const table_identifier = quote_identifier(test_table_name);
		const user_model = create_user_model(connection, test_table_name);

		try {
			await drop_table_if_exists(connection, table_identifier);

			await user_model.ensure_table();
			await user_model.ensure_index();
			await user_model.ensure_schema();

			const first_document = new user_model({
				user_name: 'john',
				age: 30,
				tags: ['electronics', 'gaming'],
				address: {city: 'Miami', country: 'US'},
				orders: [{price: 12.5, status: 'paid'}]
			});

			const second_document = new user_model({
				user_name: 'jane',
				age: 22,
				tags: ['books'],
				address: {city: 'Miami', country: 'US'},
				orders: [{price: 8.2, status: 'paid'}]
			});

			const third_document = new user_model({
				user_name: 'mark',
				age: 17,
				tags: ['electronics'],
				address: {city: 'Tampa', country: 'US'},
				orders: [{price: 20, status: 'pending'}]
			});

			const saved_first_document = await first_document.save();
			const saved_second_document = await second_document.save();
			const saved_third_document = await third_document.save();

			expect(saved_first_document.user_name).toBe('john');
			expect(saved_second_document.user_name).toBe('jane');
			expect(saved_third_document.user_name).toBe('mark');
			expect(first_document.is_new).toBe(false);
			expect(second_document.is_new).toBe(false);
			expect(third_document.is_new).toBe(false);
		} finally {
			await drop_table_if_exists(connection, table_identifier);
		}
	});

	test('queries persisted documents across scalar, regex, and nested paths', async function () {
		const test_table_name = build_test_table_name();
		const table_identifier = quote_identifier(test_table_name);
		const user_model = create_user_model(connection, test_table_name);

		try {
			await drop_table_if_exists(connection, table_identifier);

			await user_model.ensure_table();
			await user_model.ensure_index();
			await user_model.ensure_schema();
			await seed_user_documents(user_model);

			const adults_in_miami = await user_model.find({age: {$gte: 18}})
				.where({'address.city': 'Miami'})
				.sort({age: -1})
				.limit(10)
				.skip(0)
				.exec();

			expect(adults_in_miami.length).toBe(2);
			expect(adults_in_miami[0].user_name).toBe('john');

			const regex_match = await user_model.find_one({
				user_name: {$regex: 'jo', $options: 'i'}
			}).exec();

			expect(regex_match.user_name).toBe('john');

			const expensive_order_count = await user_model.count_documents({
				'orders.price': {$gt: 10}
			}).exec();

			expect(expensive_order_count).toBe(2);

			const tagged_count = await user_model.count_documents({
				tags: 'electronics'
			}).exec();

			expect(tagged_count).toBe(2);
		} finally {
			await drop_table_if_exists(connection, table_identifier);
		}
	});

	test('updates and deletes persisted documents end to end', async function () {
		const test_table_name = build_test_table_name();
		const table_identifier = quote_identifier(test_table_name);
		const user_model = create_user_model(connection, test_table_name);

		try {
			await drop_table_if_exists(connection, table_identifier);

			await user_model.ensure_table();
			await user_model.ensure_index();
			await user_model.ensure_schema();
			await seed_user_documents(user_model);

			const updated_document = await user_model.update_one(
				{user_name: 'john'},
				{$set: {age: 31, 'address.city': 'Orlando'}}
			);

			expect(updated_document.age).toBe(31);
			expect(updated_document.address.city).toBe('Orlando');

			const updated_lookup = await user_model.find_one({user_name: 'john'}).exec();

			expect(updated_lookup.age).toBe(31);
			expect(updated_lookup.address.city).toBe('Orlando');

			const deleted_document = await user_model.delete_one({user_name: 'jane'});

			expect(deleted_document.user_name).toBe('jane');

			const deleted_lookup = await user_model.find_one({user_name: 'jane'}).exec();
			const after_delete_count = await user_model.count_documents({}).exec();

			expect(deleted_lookup).toBeNull();
			expect(after_delete_count).toBe(2);
		} finally {
			await drop_table_if_exists(connection, table_identifier);
		}
	});
});

function create_user_model(connection, table_name) {
	const model_name = 'User_' + table_name;
	const user_schema = new jsonbadger.Schema({
		user_name: {type: String, required: true},
		age: {type: Number, min: 0},
		tags: [String],
		address: {city: String, country: String},
		orders: [Object]
	});

	user_schema.create_index({using: 'gin', path: 'user_name'});
	user_schema.create_index({using: 'btree', paths: {'address.city': 1, age: -1}});

	return connection.model({
		name: model_name,
		schema: user_schema,
		table_name: table_name
	});
}

async function seed_user_documents(user_model) {
	const first_document = new user_model({
		user_name: 'john',
		age: 30,
		tags: ['electronics', 'gaming'],
		address: {city: 'Miami', country: 'US'},
		orders: [{price: 12.5, status: 'paid'}]
	});

	const second_document = new user_model({
		user_name: 'jane',
		age: 22,
		tags: ['books'],
		address: {city: 'Miami', country: 'US'},
		orders: [{price: 8.2, status: 'paid'}]
	});

	const third_document = new user_model({
		user_name: 'mark',
		age: 17,
		tags: ['electronics'],
		address: {city: 'Tampa', country: 'US'},
		orders: [{price: 20, status: 'pending'}]
	});

	await first_document.save();
	await second_document.save();
	await third_document.save();
}

async function drop_table_if_exists(connection, table_identifier) {
	await connection.pool_instance.query('DROP TABLE IF EXISTS ' + table_identifier + ';');
}

function build_test_table_name() {
	const random_suffix = String(Math.floor(Math.random() * 1000000));
	const timestamp = Date.now();

	return 'jsonbadger_local_test_' + timestamp + '_' + random_suffix;
}
