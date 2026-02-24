import {beforeEach, describe, expect, test} from '@jest/globals';

import defaults from '#src/constants/defaults.js';
import {
	clear_pool,
	get_connection_options,
	get_debug_mode,
	get_pool,
	get_server_capabilities,
	has_pool,
	set_pool
} from '#src/connection/pool-store.js';

describe('pool-store', function () {
	beforeEach(function () {
		clear_pool();
	});

	test('starts disconnected and exposes default state', function () {
		expect(has_pool()).toBe(false);
		expect(get_debug_mode()).toBe(defaults.connection_options.debug);
		expect(get_connection_options()).toEqual(defaults.connection_options);
		expect(get_connection_options()).not.toBe(defaults.connection_options);
		expect(get_server_capabilities()).toBeNull();

		expect(function get_pool_without_connect() {
			get_pool();
		}).toThrow('jsonbadger is not connected. Call connect() first.');
	});

	test('stores pool state, merges options, and snapshots frozen server capabilities', function () {
		const pool_instance = {tag: 'pool'};
		const server_capabilities = {
			server_version: '18.1',
			server_version_num: 180001,
			supports_uuidv7: true
		};

		set_pool(pool_instance, {
			max: 5,
			debug: true
		}, server_capabilities);

		expect(has_pool()).toBe(true);
		expect(get_pool()).toBe(pool_instance);
		expect(get_debug_mode()).toBe(true);
		expect(get_connection_options()).toEqual(Object.assign({}, defaults.connection_options, {
			max: 5,
			debug: true
		}));

		const stored_server_capabilities = get_server_capabilities();
		expect(stored_server_capabilities).toEqual(server_capabilities);
		expect(stored_server_capabilities).not.toBe(server_capabilities);
		expect(Object.isFrozen(stored_server_capabilities)).toBe(true);

		server_capabilities.supports_uuidv7 = false;
		expect(get_server_capabilities().supports_uuidv7).toBe(true);

		expect(function mutate_frozen_server_capabilities() {
			stored_server_capabilities.supports_uuidv7 = false;
		}).toThrow();
	});

	test('returns a cloned connection_options object on each call', function () {
		set_pool({tag: 'pool'}, {max: 3, debug: true}, null);

		const first_options = get_connection_options();
		first_options.max = 999;
		first_options.debug = false;

		expect(get_connection_options()).toEqual(Object.assign({}, defaults.connection_options, {
			max: 3,
			debug: true
		}));
	});

	test('falls back to default connection options when options are omitted', function () {
		set_pool({tag: 'pool'}, undefined, null);

		expect(get_connection_options()).toEqual(defaults.connection_options);
		expect(get_debug_mode()).toBe(defaults.connection_options.debug);
		expect(get_server_capabilities()).toBeNull();
	});

	test('clear_pool resets pool, options, debug mode, and server capabilities', function () {
		set_pool({tag: 'pool'}, {debug: true, max: 2}, {
			server_version: '18.1',
			server_version_num: 180001,
			supports_uuidv7: true
		});

		clear_pool();

		expect(has_pool()).toBe(false);
		expect(get_debug_mode()).toBe(defaults.connection_options.debug);
		expect(get_connection_options()).toEqual(defaults.connection_options);
		expect(get_server_capabilities()).toBeNull();

		expect(function get_pool_after_clear() {
			get_pool();
		}).toThrow('jsonbadger is not connected. Call connect() first.');
	});
});
