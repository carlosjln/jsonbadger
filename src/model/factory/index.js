import defaults from '#src/constants/defaults.js';

import Model from '#src/model/model.js';
import Schema from '#src/schema/schema.js';

import {assert_condition, assert_identifier} from '#src/utils/assert.js';
import {is_not_object} from '#src/utils/value.js';

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
	assert_condition(schema instanceof Schema, 'schema must be a Schema instance');
	assert_condition(!is_not_object(options), 'options are required');
	assert_identifier(options.table_name, 'table_name');

	// Override default model options with instance options
	const $options = Object.assign({}, defaults.model_options, options);
	const $schema = schema.clone().configure_validators();

	$schema.$bind_connection(connection);

	// Create the concrete Model constructor for this definition.
	function model(data) {
		Model.call(this, data);
	}

	// Wire Model inheritance against the base Model chain.
	Object.setPrototypeOf(model, Model);
	Object.setPrototypeOf(model.prototype, Model.prototype);

	// Bind schema/model/connection state onto the compiled constructor.
	model.$name = name;
	model.schema = $schema;
	model.options = $options;
	model.state = {indexes_ensured: false};

	model.connection = connection;
	model.prototype.connection = connection;

	// Return the compiled Model constructor.
	return model;
}

export default model;
