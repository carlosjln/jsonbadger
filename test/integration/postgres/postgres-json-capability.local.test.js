import {afterAll, beforeAll, describe, expect, test} from '@jest/globals';

import jsonbadger from '#src/index.js';
import {has_own} from '#src/utils/object.js';
import {
	build_test_table_name,
	connect_local_jsonbadger,
	disconnect_connection,
	drop_table_if_exists
} from '#test/integration/postgres/helpers.js';

describe('PostgreSQL JSON capability alignment', function () {
	let connection;

	beforeAll(async function setup_database() {
		connection = await connect_local_jsonbadger(jsonbadger);
	});

	afterAll(async function teardown_database() {
		await disconnect_connection(connection);
	});

	test('matches PostgreSQL JSON existence and containment semantics', async function () {
		const test_table_name = build_test_table_name('jsonbadger_pg_caps_test');
		const capability_model = create_capability_model(connection, test_table_name);

		try {
			await drop_table_if_exists(connection, test_table_name);
			await capability_model.ensure_table();
			await seed_capability_documents(capability_model);

			const has_profile = await capability_model.find({payload: {$has_key: 'profile'}})
				.sort({user_name: 1})
				.exec();
			const has_literal_dotted_key = await capability_model.find({payload: {$has_key: 'profile.city'}}).exec();
			const nested_profile_has_city = await capability_model.find({'payload.profile': {$has_key: 'city'}}).exec();

			expect(has_profile.map(function pick_user(row) {return read_model_data(row).user_name;})).toEqual(['alpha', 'beta']);
			expect(has_literal_dotted_key).toEqual([]);
			expect(nested_profile_has_city.map(function pick_user(row) {return read_model_data(row).user_name;})).toEqual(['alpha']);

			const contains_nested_object = await capability_model.find({
				payload: {$contains: {profile: {city: 'Miami'}}}
			}).exec();
			const contains_nested_array = await capability_model.find({
				payload: {$contains: {flags: ['vip']}}
			}).exec();

			expect(contains_nested_object.map(function pick_user(row) {return read_model_data(row).user_name;})).toEqual(['alpha']);
			expect(contains_nested_array.map(function pick_user(row) {return read_model_data(row).user_name;})).toEqual(['alpha']);
		} finally {
			await drop_table_if_exists(connection, test_table_name);
		}
	});

	test('matches the clean public JSON query surface for existence and comparisons', async function () {
		const test_table_name = build_test_table_name('jsonbadger_pg_caps_test');
		const capability_model = create_capability_model(connection, test_table_name);

		try {
			await drop_table_if_exists(connection, test_table_name);
			await capability_model.ensure_table();
			await seed_capability_documents(capability_model);

			const existing_nested_path = await capability_model.find({
				'payload.profile.city': {$exists: true}
			}).exec();
			const array_item_match = await capability_model.find({
				'payload.items': {
					$elem_match: {
						qty: {$gt: 1}
					}
				}
			}).exec();
			const scalar_comparison_match = await capability_model.find({
				'payload.score': {$gt: 10}
			}).exec();
			const missing_nested_path = await capability_model.find({
				'payload.missing.deep': {$exists: true}
			}).exec();

			expect(existing_nested_path.map(function pick_user(row) {return read_model_data(row).user_name;})).toEqual(['alpha']);
			expect(array_item_match.map(function pick_user(row) {return read_model_data(row).user_name;})).toEqual(['alpha']);
			expect(scalar_comparison_match.map(function pick_user(row) {return read_model_data(row).user_name;})).toEqual(['alpha']);
			expect(missing_nested_path).toEqual([]);
		} finally {
			await drop_table_if_exists(connection, test_table_name);
		}
	});

	test('matches PostgreSQL JSON update-path behavior and persisted state', async function () {
		const test_table_name = build_test_table_name('jsonbadger_pg_caps_test');
		const capability_model = create_capability_model(connection, test_table_name);

		try {
			await drop_table_if_exists(connection, test_table_name);
			await capability_model.ensure_table();
			await seed_capability_documents(capability_model);

			const after_missing_path_create = await capability_model.update_one({user_name: 'alpha'}, {
				$set: {
					'payload.profile.state': 'FL'
				}
			});

			expect(read_model_data(after_missing_path_create).payload.profile.state).toBe('FL');

			const after_insert_before = await capability_model.update_one({user_name: 'alpha'}, {
				$set: {
					tags: ['zero', 'one', 'three']
				}
			});

			expect(read_model_data(after_insert_before).tags).toEqual(['zero', 'one', 'three']);

			const after_insert_after = await capability_model.update_one({user_name: 'alpha'}, {
				$set: {
					tags: ['zero', 'zero_plus', 'one', 'three']
				}
			});

			expect(read_model_data(after_insert_after).tags).toEqual(['zero', 'zero_plus', 'one', 'three']);

			const after_delete_key = await capability_model.update_one({user_name: 'alpha'}, {
				$unset: ['payload.cleanup_flag']
			});

			expect(has_own(read_model_data(after_delete_key).payload, 'cleanup_flag')).toBe(false);

			const persisted_alpha = await capability_model.find_one({user_name: 'alpha'}).exec();
			expect(read_model_data(persisted_alpha).tags).toEqual(['zero', 'zero_plus', 'one', 'three']);
			expect(read_model_data(persisted_alpha).payload.profile.state).toBe('FL');
			expect(has_own(read_model_data(persisted_alpha).payload, 'cleanup_flag')).toBe(false);
		} finally {
			await drop_table_if_exists(connection, test_table_name);
		}
	});
});

function create_capability_model(connection, table_name) {
	const model_name = 'Capability_' + table_name;
	const capability_schema = new jsonbadger.Schema({
		user_name: String,
		tags: [String],
		payload: {}
	});

	return connection.model({
		name: model_name,
		schema: capability_schema,
		table_name: table_name
	});
}

async function seed_capability_documents(capability_model) {
	await capability_model.from({
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

	await capability_model.from({
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
}

function read_model_data(model_instance) {
	const default_slug = model_instance.constructor.schema.get_default_slug();
	return model_instance.document[default_slug];
}
