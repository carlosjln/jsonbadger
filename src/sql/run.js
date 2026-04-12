/*
 * MODULE RESPONSIBILITY
 * Execute SQL text against the resolved connection and normalize query failures.
 */
import debug_logger from '#src/debug/debug-logger.js';
import QueryError from '#src/errors/query-error.js';
import {assert_condition} from '#src/utils/assert.js';
import {is_function} from '#src/utils/value.js';

async function run(sql_text, sql_params, connection) {
	const params = sql_params || [];
	const debug_mode = resolve_debug_mode(connection);
	const pool_instance = resolve_pool_instance(connection);

	debug_logger(debug_mode, 'sql_query', {
		sql_text: sql_text,
		params: params
	});

	try {
		return await pool_instance.query(sql_text, params);
	} catch(error) {
		debug_logger(debug_mode, 'sql_error', {
			sql_text: sql_text,
			params: params,
			message: error.message
		});

		throw new QueryError('SQL execution failed', {
			sql_text: sql_text,
			params: params,
			cause: error.message
		});
	}
}

function resolve_pool_instance(connection) {
	assert_condition(connection && is_function(connection.pool_instance?.query), 'run requires connection.pool_instance');
	return connection.pool_instance;
}

function resolve_debug_mode(connection) {
	return Boolean(connection?.options?.debug);
}

export default run;
