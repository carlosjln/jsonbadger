import defaults from '#src/constants/defaults.js';
import {deep_clone} from '#src/utils/object.js';

const connection_state = {
	pool_instance: null,
	connection_instance: null,
	debug_mode: defaults.connection_options.debug,
	connection_options: deep_clone(defaults.connection_options),
	server_capabilities: null
};

function has_pool() {
	return connection_state.pool_instance !== null;
}

function get_pool() {
	if(connection_state.pool_instance) {
		return connection_state.pool_instance;
	}

	throw new Error('jsonbadger is not connected. Call connect() first.');
}

function get_connection() {
	if(connection_state.connection_instance) {
		return connection_state.connection_instance;
	}

	throw new Error('jsonbadger connection is not initialized. Call connect() first.');
}

function set_pool(state_update) {
	const {
		pool_instance,
		connection_instance = null,
		options,
		server_capabilities = null
	} = state_update;
	const resolved_options = Object.assign({}, defaults.connection_options, options || {});

	connection_state.pool_instance = pool_instance;
	connection_state.connection_instance = connection_instance;
	connection_state.connection_options = deep_clone(resolved_options);
	connection_state.debug_mode = connection_state.connection_options.debug;
	connection_state.server_capabilities = server_capabilities === null ? null : Object.freeze(Object.assign({}, server_capabilities));
}

function clear_pool() {
	connection_state.pool_instance = null;
	connection_state.connection_instance = null;
	connection_state.connection_options = deep_clone(defaults.connection_options);
	connection_state.debug_mode = defaults.connection_options.debug;
	connection_state.server_capabilities = null;
}

function get_debug_mode() {
	return connection_state.debug_mode;
}

function get_connection_options() {
	return deep_clone(connection_state.connection_options);
}

function get_server_capabilities() {
	return connection_state.server_capabilities;
}

export {
	has_pool,
	get_pool,
	get_connection,
	set_pool,
	clear_pool,
	get_debug_mode,
	get_connection_options,
	get_server_capabilities
};
