import {describe, expect, jest, test} from '@jest/globals';

const {default: IdStrategies} = await import('#src/constants/id-strategies.js');
const {scan_server_capabilities, assert_id_strategy_capability} = await import('#src/connection/server-capabilities.js');

describe('server capability scan', function () {
	test('scans PostgreSQL version and uuidv7 capability using internal SQL checks', async function () {
		const pool_instance = {
			query: jest.fn()
				.mockResolvedValueOnce({rows: [{server_version_num: '180001'}]})
				.mockResolvedValueOnce({rows: [{server_version: '18.1'}]})
				.mockResolvedValueOnce({rows: [{has_uuidv7_function: true}]})
		};

		const result = await scan_server_capabilities(pool_instance);

		expect(pool_instance.query.mock.calls.map(function (call_args) {
			return call_args[0];
		})).toEqual([
			'SHOW server_version_num;',
			'SHOW server_version;',
			"SELECT to_regprocedure('uuidv7()') IS NOT NULL AS has_uuidv7_function;"
		]);
		expect(result).toEqual({
			server_version: '18.1',
			server_version_num: 180001,
			supports_uuidv7: true
		});
	});

	test('requires PostgreSQL 18+ native support for uuidv7 even if a function is reported', async function () {
		const pool_instance = {
			query: jest.fn()
				.mockResolvedValueOnce({rows: [{server_version_num: '170005'}]})
				.mockResolvedValueOnce({rows: [{server_version: '17.5'}]})
				.mockResolvedValueOnce({rows: [{has_uuidv7_function: true}]})
		};

		const result = await scan_server_capabilities(pool_instance);

		expect(result.supports_uuidv7).toBe(false);
	});
});

describe('id strategy capability assertion', function () {
	test('does nothing for non-uuidv7 strategies', function () {
		expect(function assert_bigserial_capability() {
			assert_id_strategy_capability(IdStrategies.bigserial, null);
		}).not.toThrow();
	});

	test('throws a clear error when uuidv7 is unsupported', function () {
		expect(function assert_unsupported_uuidv7() {
			assert_id_strategy_capability(IdStrategies.uuidv7, {
				server_version: '17.4',
				server_version_num: 170004,
				supports_uuidv7: false
			});
		}).toThrow('id_strategy=uuidv7 requires PostgreSQL native uuidv7() support (PostgreSQL 18+)');
	});
});
