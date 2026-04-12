import {describe, expect, jest, test} from '@jest/globals';
const {scan_server_capabilities} = await import('#src/connection/server-capabilities.js');

describe('server capability scan', function () {
	test('scans PostgreSQL version, uuidv7 capability, and jsonpath capability using internal SQL checks', async function () {
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
			supports_uuidv7: true,
			supports_jsonpath: true
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
		expect(result.supports_jsonpath).toBe(true);
	});

	test('reports jsonpath as unsupported below PostgreSQL 12', async function () {
		const pool_instance = {
			query: jest.fn()
				.mockResolvedValueOnce({rows: [{server_version_num: '110012'}]})
				.mockResolvedValueOnce({rows: [{server_version: '11.12'}]})
				.mockResolvedValueOnce({rows: [{has_uuidv7_function: false}]})
		};

		const result = await scan_server_capabilities(pool_instance);

		expect(result.supports_jsonpath).toBe(false);
	});
});
