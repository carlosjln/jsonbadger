import debug_logger from '#src/debug/debug-logger.js';
import QueryError from '#src/errors/query-error.js';
import {get_debug_mode, get_pool} from '#src/connection/pool-store.js';

export default async function sql_runner(sql_text, sql_params) {
	const params = sql_params || [];
	const debug_mode = get_debug_mode();
	const pool_instance = get_pool();

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

