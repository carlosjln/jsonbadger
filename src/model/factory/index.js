import defaults from '#src/constants/defaults.js';
import {assert_id_strategy} from '#src/constants/id-strategies.js';

import Model from '#src/model/model.js';

import {assert_condition, assert_identifier} from '#src/utils/assert.js';
import {is_boolean, is_function, is_not_object} from '#src/utils/value.js';

/**
 * Compile one concrete Model constructor for a schema/config/connection definition.
 *
 * Compile lifecycle:
 * 1. Validate schema/config input.
 * 2. Normalize model options and reserve internal columns.
 * 3. Create the concrete Model constructor for this definition.
 * 4. Wire Model inheritance against the base Model chain.
 * 5. Bind schema/model/connection state onto the compiled constructor.
 * 6. Return the compiled Model constructor.
 *
 * @param {string|undefined} name
 * @param {object} schema
 * @param {object} options
 * @param {object|null} connection
 * @returns {Function}
 */
function model(name, schema, options, connection) {
	// Validate schema/config input.
	assert_condition(schema && is_function(schema.validate), 'schema is required');
	assert_condition(!is_not_object(options), 'options are required');

	// Normalize model options and reserve internal columns.
	const default_model_options = defaults.model_options;

	// Override default model options with instance options
	const $options = Object.assign({}, default_model_options, options);

	const $connection = connection;
	const $connection_options = $connection.options;

	const $id_strategy = $options.id_strategy ?? $connection_options.id_strategy;
	const $auto_index = $options.auto_index ?? $connection_options.auto_index;
	const $schema = Object.create(schema);

	assert_identifier($options.table_name, 'table_name');
	assert_identifier($options.data_column, 'data_column');
	assert_id_strategy($id_strategy);
	assert_condition(is_boolean($auto_index), 'auto_index must be a boolean');

	$schema.id_strategy = $id_strategy;

	// Create the concrete Model constructor for this definition.
	function model(data, options = {}) {
		Model.call(this, data, options);
	}

	// Wire Model inheritance against the base Model chain.
	Object.setPrototypeOf(model, Model);
	Object.setPrototypeOf(model.prototype, Model.prototype);

	// Bind schema/model/connection state onto the compiled constructor.
	model.name = name || $options.table_name;
	model.schema = $schema;
	model.options = $options;
	model.state = {indexes_ensured: false};

	model.connection = $connection;
	model.prototype.connection = $connection;

	model.auto_index = $auto_index;

	// Return the compiled Model constructor.
	return model;
}

export default model;
