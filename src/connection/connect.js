import {Pool} from 'pg';

import defaults from '#src/constants/defaults.js';
import debug_logger from '#src/debug/debug-logger.js';

import {assert_condition} from '#src/utils/assert.js';
import {assert_valid_id_strategy} from '#src/constants/id-strategies.js';
import {scan_server_capabilities, assert_id_strategy_capability} from '#src/connection/server-capabilities.js';
import {is_string} from '#src/utils/value.js';
import {get_pool, has_pool, set_pool} from '#src/connection/pool-store.js';

export default async function connect(uri, options) {
	assert_condition(is_string(uri) && uri.length > 0, 'connection_uri is required');

	if(has_pool()) {
		return get_pool();
	}

	const final_options = Object.assign({}, defaults.connection_options, options);
	const {debug, id_strategy, auto_index, ...pool_options} = final_options;

	assert_valid_id_strategy(id_strategy);
	assert_condition(typeof auto_index === 'boolean', 'auto_index must be a boolean');

	const pool_instance = new Pool(Object.assign({}, pool_options, {connectionString: uri}));
	let server_capabilities;

	try {
		await pool_instance.query('SELECT 1');
		server_capabilities = await scan_server_capabilities(pool_instance);
		assert_id_strategy_capability(id_strategy, server_capabilities);
		set_pool(pool_instance, final_options, server_capabilities);
	} catch(error) {
		await close_pool_quietly(pool_instance);
		throw error;
	}

	debug_logger(debug, 'connection_ready', {
		max: pool_options.max,
		server_version: server_capabilities.server_version,
		supports_uuidv7: server_capabilities.supports_uuidv7
	});

	return pool_instance;
}

async function close_pool_quietly(pool_instance) {
	if(!pool_instance || typeof pool_instance.end !== 'function') {
		return;
	}

	try {
		await pool_instance.end();
	} catch(error) {
		// Ignore cleanup failures so the original connection/capability error is preserved.
	}
}
