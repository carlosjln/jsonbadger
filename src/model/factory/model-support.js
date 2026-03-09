import defaults from '#src/constants/defaults.js';
import IdStrategies from '#src/constants/id-strategies.js';
import {assert_id_strategy_capability} from '#src/connection/server-capabilities.js';
import {is_plain_object} from '#src/utils/value.js';

/**
 * Resolves effective connection options for a model.
 *
 * @param {Function} Model Model constructor.
 * @returns {object}
 */
function resolve_model_connection_options(Model) {
	const connection = Model.connection;

	if(connection && is_plain_object(connection.options)) {
		return connection.options;
	}

	return defaults.connection_options;
}

/**
 * Resolves effective server capabilities for a model.
 *
 * @param {Function} Model Model constructor.
 * @returns {object|null}
 */
function resolve_model_server_capabilities(Model) {
	if(Model.connection && Model.connection.server_capabilities) {
		return Model.connection.server_capabilities;
	}

	return null;
}

/**
 * Verifies that the active model id strategy is supported by the server.
 *
 * @param {Function} Model Model constructor.
 * @param {string} final_id_strategy Resolved id strategy.
 * @returns {void}
 */
function assert_model_id_strategy_supported(Model, final_id_strategy) {
	if(final_id_strategy !== IdStrategies.uuidv7) {
		return;
	}

	const server_capabilities = resolve_model_server_capabilities(Model);

	if(!server_capabilities) {
		return;
	}

	assert_id_strategy_capability(final_id_strategy, server_capabilities);
}

export {
	assert_model_id_strategy_supported,
	resolve_model_connection_options,
	resolve_model_server_capabilities
};
