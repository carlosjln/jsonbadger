import {afterAll, beforeAll, describe, expect, test} from '@jest/globals';

import jsonbadger from '#src/index.js';
import {quote_identifier} from '#src/utils/assert.js';
import {has_own} from '#src/utils/object.js';
import local_env_config from '#test/config/local-env-config.js';

describe('FieldTypes runtime PostgreSQL integration', function () {
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

	test('applies runtime field behavior before persistence', async function () {
		const test_table_name = build_test_table_name();
		const table_identifier = quote_identifier(test_table_name);
		const created_at = new Date('2026-02-23T12:00:00.000Z');
		const Account = create_account_model(connection, test_table_name);

		try {
			await drop_table_if_exists(connection, table_identifier);

			const account_document = new Account({
				status: 'active',
				tags: ['alpha'],
				payload: {
					legacy: true,
					prefs: {theme: 'light'}
				},
				runtime_date: created_at
			});

			account_document.set('userName', '  john  ');

			expect(account_document.userName).toBe('JOHN');
			expect(account_document.get('userName', {getters: false})).toBe('john');
			expect(account_document.$serialize({getters: false}).user_name).toBe('john');
			expect(account_document.to_json()).toMatchObject({
				user_name: 'JOHN',
				kind: 'account'
			});

			account_document.data.payload.prefs.theme = 'dark';
			account_document.data.runtime_date.setUTCDate(24);

			expect(account_document.is_modified()).toBe(true); // user_name set(...) already marked dirty
			account_document.clear_modified();
			expect(account_document.is_modified()).toBe(false);

			expect(account_document.is_modified('payload')).toBe(false);
			expect(account_document.is_modified('runtime_date')).toBe(false);

			account_document.mark_modified('payload');
			account_document.mark_modified('runtime_date');

			expect(account_document.is_modified('payload')).toBe(true);
			expect(account_document.is_modified('payload.prefs')).toBe(true);
			expect(account_document.is_modified('runtime_date')).toBe(true);
		} finally {
			await drop_table_if_exists(connection, table_identifier);
		}
	});

	test('persists document state and transitions to a persisted lifecycle', async function () {
		const test_table_name = build_test_table_name();
		const table_identifier = quote_identifier(test_table_name);
		const created_at = new Date('2026-02-23T12:00:00.000Z');
		const Account = create_account_model(connection, test_table_name);

		try {
			await drop_table_if_exists(connection, table_identifier);

			const account_document = new Account({
				user_name: 'john',
				status: 'active',
				tags: ['alpha'],
				payload: {
					legacy: true,
					prefs: {theme: 'dark'}
				},
				runtime_date: created_at
			});

			account_document.mark_modified('payload');
			account_document.mark_modified('runtime_date');

			const saved_data = await account_document.save();

			expect(saved_data.user_name).toBe('john');
			expect(account_document.is_new).toBe(false);
			expect(account_document.is_modified()).toBe(false);

			expect(function () {
				account_document.set('status', 'disabled');
			}).toThrow('immutable');
		} finally {
			await drop_table_if_exists(connection, table_identifier);
		}
	});

	test('applies JSON update operators and reads persisted changes back', async function () {
		const test_table_name = build_test_table_name();
		const table_identifier = quote_identifier(test_table_name);
		const created_at = new Date('2026-02-23T12:00:00.000Z');
		const Account = create_account_model(connection, test_table_name);

		try {
			await drop_table_if_exists(connection, table_identifier);

			const account_document = new Account({
				user_name: 'john',
				status: 'active',
				tags: ['alpha'],
				payload: {
					legacy: true,
					prefs: {theme: 'light'}
				},
				runtime_date: created_at
			});

			await account_document.save();

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

			expect(updated_data.user_name).toBe('john');
			expect(updated_data.tags).toEqual(['alpha', 'beta']);
			expect(updated_data.payload.prefs.theme).toBe('solarized');
			expect(has_own(updated_data.payload, 'legacy')).toBe(false);

			const persisted_lookup = await Account.find_one({user_name: 'john'}).exec();
			expect(persisted_lookup.tags).toEqual(['alpha', 'beta']);
			expect(persisted_lookup.payload.prefs.theme).toBe('solarized');
			expect(has_own(persisted_lookup.payload, 'legacy')).toBe(false);
		} finally {
			await drop_table_if_exists(connection, table_identifier);
		}
	});
});

function create_account_model(connection, table_name) {
	const model_name = 'Account_' + table_name;
	const account_schema = new jsonbadger.Schema({
		user_name: {
			type: String,
			alias: 'userName',
			set: function (value) {return String(value).trim();},
			get: function (value) {return String(value).toUpperCase();}
		},
		status: {
			type: String,
			immutable: true
		},
		tags: [String],
		payload: {},
		runtime_date: Date
	}, {
		serialize: {
			transform: function (doc, ret) {
				ret.kind = 'account';
				return ret;
			}
		}
	});

	return connection.model({
		name: model_name,
		schema: account_schema,
		table_name: table_name
	});
}

async function drop_table_if_exists(connection, table_identifier) {
	await connection.pool_instance.query('DROP TABLE IF EXISTS ' + table_identifier + ';');
}

function build_test_table_name() {
	const random_suffix = String(Math.floor(Math.random() * 1000000));
	const timestamp = Date.now();

	return 'jsonbadger_runtime_test_' + timestamp + '_' + random_suffix;
}
