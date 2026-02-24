import defaults from '#src/constants/defaults.js';

const connection_state = {
	pool_instance: null,
	debug_mode: defaults.connection_options.debug,
	connection_options: Object.assign({}, defaults.connection_options),
	server_capabilities: null
};

export function has_pool() {
	return connection_state.pool_instance !== null;
}

export function get_pool() {
	if(connection_state.pool_instance) {
		return connection_state.pool_instance;
	}

	throw new Error('jsonbadger is not connected. Call connect() first.');
}

export function set_pool(pool_instance, connection_options, server_capabilities) {
	connection_state.pool_instance = pool_instance;
	connection_state.connection_options = Object.assign({}, defaults.connection_options, connection_options || {});
	connection_state.debug_mode = connection_state.connection_options.debug;
	connection_state.server_capabilities = server_capabilities === null ? null : Object.freeze(Object.assign({}, server_capabilities));
}

export function clear_pool() {
	connection_state.pool_instance = null;
	connection_state.connection_options = Object.assign({}, defaults.connection_options);
	connection_state.debug_mode = defaults.connection_options.debug;
	connection_state.server_capabilities = null;
}

export function get_debug_mode() {
	return connection_state.debug_mode;
}

export function get_connection_options() {
	return Object.assign({}, connection_state.connection_options);
}

export function get_server_capabilities() {
	return connection_state.server_capabilities;
}
