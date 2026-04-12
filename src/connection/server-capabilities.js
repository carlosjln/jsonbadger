import {assert_condition} from '#src/utils/assert.js';
import {is_function} from '#src/utils/value.js';

const MIN_POSTGRES_NATIVE_JSONPATH_VERSION_NUM = 120000;
const MIN_POSTGRES_NATIVE_UUIDV7_VERSION_NUM = 180000;

async function scan_server_capabilities(pool_instance) {
	assert_condition(pool_instance && is_function(pool_instance.query), 'pool_instance.query is required');

	const server_version_num_result = await pool_instance.query('SHOW server_version_num;');
	const server_version_result = await pool_instance.query('SHOW server_version;');
	const uuidv7_function_result = await pool_instance.query(
		"SELECT to_regprocedure('uuidv7()') IS NOT NULL AS has_uuidv7_function;"
	);

	const server_version_num_text = server_version_num_result.rows?.[0]?.server_version_num;
	const server_version = server_version_result.rows?.[0]?.server_version;
	const has_uuidv7_function = uuidv7_function_result.rows?.[0]?.has_uuidv7_function === true;
	const server_version_num = Number.parseInt(String(server_version_num_text), 10);

	assert_condition(Number.isInteger(server_version_num), 'Unable to determine PostgreSQL server_version_num');
	assert_condition(typeof server_version === 'string' && server_version.length > 0, 'Unable to determine PostgreSQL server_version');

	const supports_jsonpath = server_version_num >= MIN_POSTGRES_NATIVE_JSONPATH_VERSION_NUM;
	const supports_uuidv7 = server_version_num >= MIN_POSTGRES_NATIVE_UUIDV7_VERSION_NUM && has_uuidv7_function;

	return {
		server_version: server_version,
		server_version_num: server_version_num,
		supports_uuidv7: supports_uuidv7,
		supports_jsonpath: supports_jsonpath
	};
}

export {
	MIN_POSTGRES_NATIVE_JSONPATH_VERSION_NUM,
	MIN_POSTGRES_NATIVE_UUIDV7_VERSION_NUM,
	scan_server_capabilities
};
