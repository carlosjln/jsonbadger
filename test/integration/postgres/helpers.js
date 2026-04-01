import {quote_identifier} from '#src/utils/assert.js';
import local_env_config from '#test/config/local-env-config.js';

async function connect_local_jsonbadger(jsonbadger, connection_options = {}) {
	const env_config = local_env_config();
	const pg_config = env_config.postgres;
	const jb_config = env_config.jsonbadger;

	return await jsonbadger.connect(pg_config.uri, {
		debug: jb_config.debug,
		max: pg_config.pool_max,
		ssl: pg_config.ssl,
		...connection_options
	});
}

async function disconnect_connection(connection) {
	if(connection) {
		await connection.disconnect();
	}
}

async function drop_table_if_exists(connection, table_name) {
	const table_identifier = quote_identifier(table_name);
	await connection.pool_instance.query('DROP TABLE IF EXISTS ' + table_identifier + ';');
}

function build_test_table_name(prefix_value, suffix_value = '') {
	const random_suffix = String(Math.floor(Math.random() * 1000000));
	const timestamp = Date.now();
	const normalized_suffix = suffix_value ? '_' + suffix_value : '';

	return prefix_value + normalized_suffix + '_' + timestamp + '_' + random_suffix;
}

export {
	connect_local_jsonbadger,
	disconnect_connection,
	drop_table_if_exists,
	build_test_table_name
};
