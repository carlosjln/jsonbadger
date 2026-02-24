import {afterAll, beforeAll, describe, expect, test} from '@jest/globals';

import jsonbadger from '#src/index.js';
import {quote_identifier} from '#src/utils/assert.js';
import local_env_config from '#test/config/local-env-config.js';

describe('FieldTypes runtime PostgreSQL integration', function () {
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

	test('supports runtime document behaviors and JSON update operators end to end', async function () {
		const test_table_name = build_test_table_name();
		const table_identifier = quote_identifier(test_table_name);
		const created_at = new Date('2026-02-23T12:00:00.000Z');

		try {
			await pool_instance.query('DROP TABLE IF EXISTS ' + table_identifier + ';');

			const account_schema = new jsonbadger.Schema({
				user_name: {
					type: String,
					alias: 'userName',
					set: function (value) { return String(value).trim(); },
					get: function (value) { return String(value).toUpperCase(); }
				},
				status: {
					type: String,
					immutable: true
				},
				tags: [String],
				payload: {},
				updated_at: Date
			}, {
				to_json: {
					transform: function (doc, ret) {
						ret.kind = 'account';
						return ret;
					}
				}
			});

			const Account = jsonbadger.model(account_schema, {
				table_name: test_table_name,
				data_column: 'data'
			});

			const account_document = new Account({
				status: 'active',
				tags: ['alpha'],
				payload: {
					legacy: true,
					prefs: {theme: 'light'}
				},
				updated_at: created_at
			});

			account_document.set('userName', '  john  ');

			expect(account_document.userName).toBe('JOHN');
			expect(account_document.get('userName', {getters: false})).toBe('john');
			expect(account_document.to_object({getters: false}).user_name).toBe('john');
			expect(account_document.to_json()).toMatchObject({
				user_name: 'JOHN',
				kind: 'account'
			});

			account_document.data.payload.prefs.theme = 'dark';
			account_document.data.updated_at.setUTCDate(24);

			expect(account_document.is_modified()).toBe(true); // user_name set(...) already marked dirty
			account_document.clear_modified();
			expect(account_document.is_modified()).toBe(false);

			expect(account_document.is_modified('payload')).toBe(false);
			expect(account_document.is_modified('updated_at')).toBe(false);

			account_document.mark_modified('payload');
			account_document.mark_modified('updated_at');

			expect(account_document.is_modified('payload')).toBe(true);
			expect(account_document.is_modified('payload.prefs')).toBe(true);
			expect(account_document.is_modified('updated_at')).toBe(true);

			const saved_data = await account_document.save();

			expect(saved_data.user_name).toBe('john');
			expect(account_document.is_new).toBe(false);
			expect(account_document.is_modified()).toBe(false);

			expect(function () {
				account_document.set('status', 'disabled');
			}).toThrow('immutable');

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
			expect(Object.prototype.hasOwnProperty.call(updated_data.payload, 'legacy')).toBe(false);

			const persisted_lookup = await Account.find_one({user_name: 'john'}).exec();
			expect(persisted_lookup.tags).toEqual(['alpha', 'beta']);
			expect(persisted_lookup.payload.prefs.theme).toBe('solarized');
			expect(Object.prototype.hasOwnProperty.call(persisted_lookup.payload, 'legacy')).toBe(false);
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

	return 'jsonbadger_runtime_test_' + timestamp + '_' + random_suffix;
}
