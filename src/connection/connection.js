import debug_logger from '#src/debug/debug-logger.js';
import defaults from '#src/constants/defaults.js';
import model_factory from '#src/model/model-factory.js';
import {assert_condition, assert_identifier} from '#src/utils/assert.js';
import {has_own} from '#src/utils/object.js';
import {pluralize} from '#src/utils/string.js';
import {is_function, is_plain_object} from '#src/utils/value.js';

/**
 * Stores connection-owned runtime state and model registration.
 *
 * @param {*} pool_instance Backing pg pool instance.
 * @param {object} options Normalized connection options.
 * @param {*} server_capabilities Capability snapshot for this pool.
 * @returns {void}
 */
function Connection(pool_instance, options, server_capabilities) {
	this.pool_instance = pool_instance;
	this.options = Object.assign({}, defaults.connection_options, options);
	this.server_capabilities = server_capabilities || null;
	this.models = {};
}

/**
 * Registers a model on this connection.
 *
 * @param {object} model_definition Model registration input.
 * @param {string} model_definition.name Model registry key.
 * @param {*} model_definition.schema Schema instance.
 * @param {string} [model_definition.table_name] Explicit table name override.
 * @returns {Function}
 * @throws {Error} When the definition is invalid or the model name is duplicated.
 */
Connection.prototype.model = function (model_definition) {
	assert_condition(is_plain_object(model_definition), 'model_definition is required');

	const model_name = model_definition.name;
	const schema_instance = model_definition.schema;

	assert_identifier(model_name, 'model_definition.name');
	assert_condition(schema_instance && is_function(schema_instance.validate), 'model_definition.schema is required');
	assert_condition(!has_own(this.models, model_name), 'model "' + model_name + '" is already registered on this connection');

	const model_options = create_model_options(model_definition);
	const Model = model_factory(schema_instance, model_options);

	Model.connection = this;
	Model.connection_model_name = model_name;

	this.models[model_name] = Model;
	return Model;
};

/**
 * Closes the underlying pool for this connection.
 *
 * @returns {Promise<void>}
 */
Connection.prototype.disconnect = async function () {
	const pool_instance = this.pool_instance;

	if(!pool_instance || !is_function(pool_instance.end)) {
		return;
	}

	await pool_instance.end();
	debug_logger(this.options.debug, 'connection_closed', null);
};

/**
 * Builds the model options passed into the existing model factory bridge.
 *
 * @param {object} model_definition Model registration input.
 * @returns {object}
 */
function create_model_options(model_definition) {
	const model_options = Object.assign({}, model_definition);

	delete model_options.name;
	delete model_options.schema;

	if(!model_options.table_name) {
		model_options.table_name = pluralize(model_definition.name);
	}

	return model_options;
}

export default Connection;
