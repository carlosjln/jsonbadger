import {afterAll, beforeAll, describe, expect, test} from '@jest/globals';

import jsonbadger from '#src/index.js';
import {
	build_test_table_name,
	connect_local_jsonbadger,
	disconnect_connection,
	drop_table_if_exists
} from '#test/integration/postgres/helpers.js';

describe('Local PostgreSQL integration', function () {
	let connection;

	beforeAll(async function setup_database() {
		connection = await connect_local_jsonbadger(jsonbadger);
	});

	afterAll(async function teardown_database() {
		await disconnect_connection(connection);
	});

	test('ensures schema objects and persists documents end to end', async function () {
		const test_table_name = build_test_table_name('jsonbadger_local_test');
		const user_model = create_user_model(connection, test_table_name);

		try {
			await drop_table_if_exists(connection, test_table_name);

			await user_model.ensure_table();
			await user_model.ensure_indexes();

			const first_document = user_model.from({
				user_name: 'john',
				age: 30,
				tags: ['electronics', 'gaming'],
				address: {city: 'Miami', country: 'US'},
				orders: [{price: 12.5, status: 'paid'}]
			});

			const second_document = user_model.from({
				user_name: 'jane',
				age: 22,
				tags: ['books'],
				address: {city: 'Miami', country: 'US'},
				orders: [{price: 8.2, status: 'paid'}]
			});

			const third_document = user_model.from({
				user_name: 'mark',
				age: 17,
				tags: ['electronics'],
				address: {city: 'Tampa', country: 'US'},
				orders: [{price: 20, status: 'pending'}]
			});

			const saved_first_document = await first_document.save();
			const saved_second_document = await second_document.save();
			const saved_third_document = await third_document.save();

			expect(read_model_data(saved_first_document).user_name).toBe('john');
			expect(read_model_data(saved_second_document).user_name).toBe('jane');
			expect(read_model_data(saved_third_document).user_name).toBe('mark');
			expect(first_document.is_new).toBe(false);
			expect(second_document.is_new).toBe(false);
			expect(third_document.is_new).toBe(false);
		} finally {
			await drop_table_if_exists(connection, test_table_name);
		}
	});

	test('queries persisted documents across scalar, regex, and nested paths', async function () {
		const test_table_name = build_test_table_name('jsonbadger_local_test');
		const user_model = create_user_model(connection, test_table_name);

		try {
			await drop_table_if_exists(connection, test_table_name);

			await user_model.ensure_table();
			await user_model.ensure_indexes();
			await seed_user_documents(user_model);

			const adults_in_miami = await user_model.find({age: {$gte: 18}})
				.where({'address.city': 'Miami'})
				.sort({age: -1})
				.limit(10)
				.skip(0)
				.exec();

			expect(adults_in_miami.length).toBe(2);
			expect(read_model_data(adults_in_miami[0]).user_name).toBe('john');

			const regex_match = await user_model.find_one({
				user_name: {$regex: 'jo', $options: 'i'}
			}).exec();

			expect(read_model_data(regex_match).user_name).toBe('john');

			const expensive_order_count = await user_model.count_documents({
				'orders.price': {$gt: 10}
			}).exec();

			expect(expensive_order_count).toBe(2);

			const tagged_count = await user_model.count_documents({
				tags: 'electronics'
			}).exec();

			expect(tagged_count).toBe(2);
		} finally {
			await drop_table_if_exists(connection, test_table_name);
		}
	});

	test('updates and deletes persisted documents end to end', async function () {
		const test_table_name = build_test_table_name('jsonbadger_local_test');
		const user_model = create_user_model(connection, test_table_name);

		try {
			await drop_table_if_exists(connection, test_table_name);

			await user_model.ensure_table();
			await user_model.ensure_indexes();
			await seed_user_documents(user_model);

			const updated_document = await user_model.update_one(
				{user_name: 'john'},
				{$set: {age: 31, 'address.city': 'Orlando'}}
			);

			expect(read_model_data(updated_document).age).toBe(31);
			expect(read_model_data(updated_document).address.city).toBe('Orlando');

			const updated_lookup = await user_model.find_one({user_name: 'john'}).exec();

			expect(read_model_data(updated_lookup).age).toBe(31);
			expect(read_model_data(updated_lookup).address.city).toBe('Orlando');

			const deleted_document = await user_model.delete_one({user_name: 'jane'});

			expect(read_model_data(deleted_document).user_name).toBe('jane');

			const deleted_lookup = await user_model.find_one({user_name: 'jane'}).exec();
			const after_delete_count = await user_model.count_documents({}).exec();

			expect(deleted_lookup).toBeNull();
			expect(after_delete_count).toBe(2);
		} finally {
			await drop_table_if_exists(connection, test_table_name);
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
	const first_document = user_model.from({
		user_name: 'john',
		age: 30,
		tags: ['electronics', 'gaming'],
		address: {city: 'Miami', country: 'US'},
		orders: [{price: 12.5, status: 'paid'}]
	});

	const second_document = user_model.from({
		user_name: 'jane',
		age: 22,
		tags: ['books'],
		address: {city: 'Miami', country: 'US'},
		orders: [{price: 8.2, status: 'paid'}]
	});

	const third_document = user_model.from({
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

function read_model_data(model_instance) {
	const default_slug = model_instance.constructor.schema.get_default_slug();
	return model_instance.document[default_slug];
}
