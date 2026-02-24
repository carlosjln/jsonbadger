import debug_logger from '#src/debug/debug-logger.js';
import {clear_pool, get_debug_mode, get_pool, has_pool} from '#src/connection/pool-store.js';

export default async function disconnect() {
	if(!has_pool()) {
		return;
	}

	const debug_mode = get_debug_mode();
	const pool_instance = get_pool();

	await pool_instance.end();
	clear_pool();

	debug_logger(debug_mode, 'connection_closed', null);
}
