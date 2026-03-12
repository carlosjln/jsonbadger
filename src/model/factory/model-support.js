import IdStrategies from '#src/constants/id-strategies.js';
import {assert_id_strategy_capability} from '#src/connection/server-capabilities.js';

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

/**
 * Resolves the model id strategy and verifies server support when required.
 *
 * @param {Function} Model Model constructor.
 * @returns {string}
 */
function resolve_supported_model_id_strategy(Model) {
	const final_id_strategy = Model.resolve_id_strategy();
	assert_model_id_strategy_supported(Model, final_id_strategy);
	return final_id_strategy;
}

export {
	assert_model_id_strategy_supported,
	resolve_supported_model_id_strategy,
	resolve_model_server_capabilities
};
