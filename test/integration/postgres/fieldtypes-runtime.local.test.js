import {afterAll, beforeAll, describe, expect, test} from '@jest/globals';

import jsonbadger from '#src/index.js';
import {has_own} from '#src/utils/object.js';
import {
	build_test_table_name,
	connect_local_jsonbadger,
	disconnect_connection,
	drop_table_if_exists
} from '#test/integration/postgres/helpers.js';

describe('FieldTypes runtime PostgreSQL integration', function () {
	let connection;

	beforeAll(async function setup_database() {
		connection = await connect_local_jsonbadger(jsonbadger);
	});

	afterAll(async function teardown_database() {
		await disconnect_connection(connection);
	});

	test('builds current document state through Model.from(...) and tracks nested payload mutations', async function () {
		const test_table_name = build_test_table_name('jsonbadger_runtime_test');
		const created_at = new Date('2026-02-23T12:00:00.000Z');
		const Account = create_account_model(connection, test_table_name);
		const default_slug = Account.schema.get_default_slug();

		try {
			await drop_table_if_exists(connection, test_table_name);

			const account_document = Account.from({
				status: 'active',
				tags: ['alpha'],
				payload: {
					legacy: true,
					prefs: {theme: 'light'}
				},
				runtime_date: created_at
			});

			expect(read_model_data(account_document)).toEqual({
				status: 'active',
				tags: ['alpha'],
				payload: {
					legacy: true,
					prefs: {theme: 'light'}
				},
				runtime_date: created_at
			});

			read_model_data(account_document).payload.prefs.theme = 'dark';

			expect(account_document.get(default_slug + '.payload.prefs.theme')).toBe('dark');
			expect(account_document.document.$has_changes()).toBe(true);
			expect(account_document.document.$get_delta()).toEqual({
				replace_roots: {},
				set: {
					[default_slug + '.payload.prefs.theme']: 'dark'
				},
				unset: []
			});
		} finally {
			await drop_table_if_exists(connection, test_table_name);
		}
	});

	test('persists document state and transitions to a persisted lifecycle', async function () {
		const test_table_name = build_test_table_name('jsonbadger_runtime_test');
		const created_at = new Date('2026-02-23T12:00:00.000Z');
		const Account = create_account_model(connection, test_table_name);

		try {
			await drop_table_if_exists(connection, test_table_name);
			await Account.ensure_table();
			await Account.ensure_indexes();

			const account_document = Account.from({
				user_name: 'john',
				status: 'active',
				tags: ['alpha'],
				payload: {
					legacy: true,
					prefs: {theme: 'dark'}
				},
				runtime_date: created_at
			});

			const saved_data = await account_document.save();

			expect(read_model_data(saved_data).user_name).toBe('john');
			expect(account_document.is_new).toBe(false);
			expect(account_document.document.$has_changes()).toBe(false);

			expect(function () {
				account_document.set('status', 'disabled');
			}).toThrow('immutable');
		} finally {
			await drop_table_if_exists(connection, test_table_name);
		}
	});

	test('applies JSON update operators and reads persisted changes back', async function () {
		const test_table_name = build_test_table_name('jsonbadger_runtime_test');
		const created_at = new Date('2026-02-23T12:00:00.000Z');
		const Account = create_account_model(connection, test_table_name);

		try {
			await drop_table_if_exists(connection, test_table_name);

			await Account.ensure_table();
			await Account.ensure_indexes();

			await Account.from({
				user_name: 'john',
				status: 'active',
				tags: ['alpha'],
				payload: {
					legacy: true,
					prefs: {theme: 'light'}
				},
				runtime_date: created_at
			}).save();

			const updated_data = await Account.update_one({user_name: 'john'}, {
				$set: {
					'payload.prefs.theme': 'solarized'
				},
				$insert: {
					'tags.0': {
						value: 'beta',
						insert_after: true
					}
				},
				$set_lax: {
					'payload.legacy': {
						value: null,
						null_value_treatment: 'delete_key'
					}
				}
			});

			expect(read_model_data(updated_data).user_name).toBe('john');
			expect(read_model_data(updated_data).tags).toEqual(['alpha', 'beta']);
			expect(read_model_data(updated_data).payload.prefs.theme).toBe('solarized');
			expect(has_own(read_model_data(updated_data).payload, 'legacy')).toBe(false);

			const persisted_lookup = await Account.find_one({user_name: 'john'}).exec();
			expect(read_model_data(persisted_lookup).tags).toEqual(['alpha', 'beta']);
			expect(read_model_data(persisted_lookup).payload.prefs.theme).toBe('solarized');
			expect(has_own(read_model_data(persisted_lookup).payload, 'legacy')).toBe(false);
		} finally {
			await drop_table_if_exists(connection, test_table_name);
		}
	});
});

function create_account_model(connection, table_name) {
	const model_name = 'Account_' + table_name;
	const account_schema = new jsonbadger.Schema({
		user_name: String,
		status: {
			type: String,
			immutable: true
		},
		tags: [String],
		payload: {},
		runtime_date: Date
	});

	return connection.model({
		name: model_name,
		schema: account_schema,
		table_name: table_name
	});
}

function read_model_data(model_instance) {
	const default_slug = model_instance.constructor.schema.get_default_slug();
	return model_instance.document[default_slug];
}
