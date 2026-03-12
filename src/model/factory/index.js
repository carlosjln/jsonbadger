import defaults from '#src/constants/defaults.js';

import Model from '#src/model/model.js';

import {assert_condition, assert_identifier} from '#src/utils/assert.js';
import {is_function, is_not_object, is_plain_object} from '#src/utils/value.js';

/**
 * Compile one concrete Model constructor for a schema/config/connection definition.
 *
 * Compile lifecycle:
 * 1. Validate schema/config input.
 * 2. Normalize model options and reserve internal columns.
 * 3. Create the concrete Model constructor for this definition.
 * 4. Wire Model inheritance against the base Model/Document chain.
 * 5. Bind schema/model/connection state onto the compiled constructor.
 * 6. Declare the static methods this compiled model will expose.
 * 7. Return the compiled Model constructor.
 *
 * @param {string|undefined} name
 * @param {object} schema
 * @param {object} options
 * @param {object|null} connection
 * @returns {Function}
 */
function model(name, schema, options, connection) {
	// 1. Validate schema/config input.
	assert_condition(schema && is_function(schema.validate), 'schema is required');
	assert_condition(!is_not_object(options), 'options are required');

	// 2. Normalize model options and reserve internal columns.
	const $options = Object.assign({}, defaults.model_options, options);
	$options.data_column = defaults.model_options.data_column;

	assert_identifier($options.table_name, 'table_name');
	assert_identifier($options.data_column, 'data_column');

	// 3. Create the concrete Model constructor for this definition.
	/**
	 * Concrete model constructor compiled for one schema/config/connection definition.
	 *
	 * Instance lifecycle:
	 * 1. Receive raw input data from user code.
	 * 2. Initialize instance state through the base Model/Document chain.
	 *
	 * @param {*} data
	 * @param {object} [options]
	 * @returns {void}
	 */
	function model(data, options = {}) {
		Model.call(this, data, options);
	}

	// 4. Wire Model inheritance against the base Model/Document chain.
	Object.setPrototypeOf(model, Model);
	Object.setPrototypeOf(model.prototype, Model.prototype);

	// 5. Bind schema/model/connection state onto the compiled constructor.
	const $connection = connection || null;
	const $connection_options = $connection?.options || defaults.connection_options;
	const $id_strategy = $options.id_strategy ?? $connection_options.id_strategy;
	const $auto_index = $options.auto_index ?? $connection_options.auto_index;

	assert_id_strategy($id_strategy);
	assert_condition(is_boolean($auto_index), 'auto_index must be a boolean');

	model.name = name || $options.table_name;
	model.schema = schema;
	model.$options = $options;

	model.connection = $connection;
	model.prototype.connection = $connection;

	model.id_strategy = $id_strategy;
	model.auto_index = $auto_index;

	// 6. Declare the static methods this compiled model will expose.
	model.reset_index_cache = function () {};

	model.apply_document_row = function (target_document, row_value, options = {}) {
		void row_value;
		void options;
		return target_document;
	};

	model.create = async function (documents) {
		void documents;
	};

	model.update_one = async function (query_filter, update_definition) {
		void query_filter;
		void update_definition;
	};

	model.delete_one = async function (query_filter) {
		void query_filter;
	};

	model.ensure_table = async function () {};

	model.ensure_index = async function (index_definition) {
		void index_definition;
	};

	model.ensure_schema = async function () {};

	model.find = function (query_filter) {
		void query_filter;
	};

	model.find_one = function (query_filter) {
		void query_filter;
	};

	model.find_by_id = function (id_value) {
		void id_value;
	};

	model.count_documents = async function (query_filter) {
		void query_filter;
	};

	// 7. Return the compiled Model constructor.
	return model;
}

export default model;
