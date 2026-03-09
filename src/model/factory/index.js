import defaults from '#src/constants/defaults.js';
import IdStrategies, {assert_valid_id_strategy} from '#src/constants/id-strategies.js';

import document_instance from '#src/model/document-instance.js';
import {compile_delete_one} from '#src/model/factory/delete-compiler.js';
import {
	build_document_instance,
	normalize_payload,
	resolve_from_strict_mode,
	resolve_source_data
} from '#src/model/factory/from-runtime.js';
import {install_migration_methods} from '#src/model/factory/migration-methods.js';
import {
	assert_model_id_strategy_supported,
	resolve_model_connection_options
} from '#src/model/factory/model-support.js';
import {
	ensure_model_runtime_state,
	reset_model_index_cache
} from '#src/model/factory/model-runtime-state.js';
import {install_read_methods} from '#src/model/factory/read-methods.js';
import {compile_update_one} from '#src/model/factory/update-compiler.js';

import {assert_condition, assert_identifier} from '#src/utils/assert.js';
import {is_array} from '#src/utils/array.js';
import {has_own} from '#src/utils/object.js';
import {is_function, is_not_object} from '#src/utils/value.js';

/**
 * Creates a model constructor for a schema/table pairing.
 *
 * @param {object} schema_instance Schema instance.
 * @param {object} model_configuration Model configuration options.
 * @param {object|null} connection_context Owning connection context.
 * @param {string|undefined} model_name Logical model name.
 * @returns {Function}
 */
function model(schema_instance, model_configuration, connection_context, model_name) {
	assert_condition(schema_instance && is_function(schema_instance.validate), 'schema_instance is required');
	assert_condition(!is_not_object(model_configuration), 'model options are required');
	assert_condition(has_own(model_configuration, 'data_column') === false, 'model options.data_column is reserved for internal use and cannot be configured');

	const model_options = Object.assign({}, defaults.model_options, model_configuration);
	model_options.data_column = defaults.model_options.data_column;

	assert_identifier(model_options.table_name, 'table_name');
	assert_identifier(model_options.data_column, 'data_column');

	/**
	 * Creates a runtime document wrapper for model payload data.
	 *
	 * @param {*} data Initial payload data.
	 * @returns {void}
	 */
	function Model(data) {
		this.data = data || {};
	}

	Model.model_name = model_name || model_options.table_name;
	Model.schema_instance = schema_instance;
	Model.model_options = model_options;
	Model.connection = connection_context || null;
	ensure_model_runtime_state(Model);

	Model.reset_index_cache = function () {
		reset_model_index_cache(Model);
	};

	Model.resolve_id_strategy = function () {
		const connection_options = resolve_model_connection_options(Model);
		const model_id_strategy = model_options.id_strategy;
		const server_id_strategy = connection_options.id_strategy;
		const final_id_strategy = model_id_strategy ?? server_id_strategy;

		assert_valid_id_strategy(final_id_strategy);

		return final_id_strategy;
	};

	Model.resolve_auto_index = function () {
		const connection_options = resolve_model_connection_options(Model);
		const model_auto_index = model_options.auto_index;
		const server_auto_index = connection_options.auto_index;
		const final_auto_index = model_auto_index ?? server_auto_index;

		assert_condition(typeof final_auto_index === 'boolean', 'auto_index must be a boolean');

		return final_auto_index;
	};

	Model.assert_id_strategy_supported = function () {
		const final_id_strategy = Model.resolve_id_strategy();
		assert_model_id_strategy_supported(Model, final_id_strategy);
		return final_id_strategy;
	};

	document_instance(Model);
	install_migration_methods(Model, schema_instance, model_options);
	install_read_methods(Model);

	Model.create = async function (document_value_or_list) {
		if(is_array(document_value_or_list)) {
			const created_documents = [];

			for(const document_value of document_value_or_list) {
				const next_document = new Model(document_value || {});
				created_documents.push(await next_document.save());
			}

			return created_documents;
		}

		const next_document = new Model(document_value_or_list || {});
		return next_document.save();
	};

	Model.from = function (source_value, runtime_options) {
		const source_data = resolve_source_data(schema_instance, source_value);
		const strict_mode = resolve_from_strict_mode(schema_instance, runtime_options);
		const normalized_payload = normalize_payload(schema_instance, source_data.payload, strict_mode);
		return build_document_instance(Model, normalized_payload, source_data.base_fields, false);
	};

	Model.hydrate = function (source_value) {
		const source_data = resolve_source_data(schema_instance, source_value);
		const normalized_payload = normalize_payload(schema_instance, source_data.payload, schema_instance.strict);
		return build_document_instance(Model, normalized_payload, source_data.base_fields, true);
	};

	Model.update_one = async function (query_filter, update_definition) {
		return compile_update_one(Model, schema_instance, model_options, query_filter, update_definition);
	};

	Model.delete_one = async function (query_filter) {
		return compile_delete_one(Model, schema_instance, model_options, query_filter);
	};

	const connection_options = resolve_model_connection_options(Model);
	const eager_id_strategy = model_options.id_strategy ?? connection_options.id_strategy;

	if(eager_id_strategy === IdStrategies.uuidv7) {
		Model.assert_id_strategy_supported();
	}

	return Model;
}

export default model;
