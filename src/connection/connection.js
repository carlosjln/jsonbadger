import debug_logger from '#src/debug/debug-logger.js';
import defaults from '#src/constants/defaults.js';
import ModelOverwriteError from '#src/errors/model-overwrite-error.js';
import model_factory from '#src/model/model-factory.js';
import {assert_condition, assert_identifier} from '#src/utils/assert.js';
import {are_equal} from '#src/utils/object.js';
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
 * @throws {Error} When the definition is invalid.
 * @throws {ModelOverwriteError} When an existing model is redefined with different schema/options.
 */
Connection.prototype.model = function (model_definition) {
	assert_condition(is_plain_object(model_definition), 'model_definition is required');

	const model_name = model_definition.name;
	const schema_instance = model_definition.schema;

	assert_identifier(model_name, 'model_definition.name');

	const existing_model = this.models[model_name];
	const model_options = create_model_options(model_definition);
	const requested_definition = {
		name: model_name,
		schema_instance,
		model_options
	};

	if(existing_model) {
		assert_model_definition_match(existing_model, requested_definition);
		return existing_model;
	}

	const Model = model_factory(schema_instance, model_options, this, model_name);

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

/**
 * Enforces idempotent model registration on a connection.
 *
 * Re-registering the same model name is allowed only when schema and
 * normalized model options match the existing model.
 *
 * @param {Function} existing_model
 * @param {object} requested_definition
 * @throws {ModelOverwriteError}
 */
function assert_model_definition_match(existing_model, requested_definition) {
	const {
		name,
		schema_instance,
		model_options
	} = requested_definition;

	if(existing_model.schema_instance !== schema_instance) {
		throw new ModelOverwriteError('model "' + name + '" is already registered with a different schema', {
			name
		});
	}

	if(!are_equal(existing_model.model_options, model_options)) {
		throw new ModelOverwriteError('model "' + name + '" is already registered with different model options', {
			name
		});
	}
}

export default Connection;
