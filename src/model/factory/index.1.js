import defaults from '#src/constants/defaults.js';
import IdStrategies, {assert_id_strategy} from '#src/constants/id-strategies.js';

import {DocumentInputMode} from '#src/model/factory/constants.js';
import {compile_delete_one} from '#src/model/factory/delete-compiler.js';
import {normalize_document_input, conform_payload_to_schema, filter_loose_payload} from '#src/model/factory/document-builder.js';
import {install_migration_methods} from '#src/model/factory/migration-methods.js';
import {resolve_model_connection_options, resolve_supported_model_id_strategy} from '#src/model/factory/model-support.js';
import {ensure_model_runtime_state, reset_model_index_cache} from '#src/model/factory/model-runtime-state.js';
import {install_read_methods} from '#src/model/factory/read-methods.js';
import {compile_update_one} from '#src/model/factory/update-compiler.js';
import BaseModel from '#src/model/model.js';

import {assert_condition, assert_identifier} from '#src/utils/assert.js';
import {is_array} from '#src/utils/array.js';
import {has_own} from '#src/utils/object.js';
import {is_boolean, is_function, is_not_object} from '#src/utils/value.js';

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
	 * Concrete model constructor compiled for this schema/config/connection definition.
	 *
	 * @param {*} data Initial payload data.
	 * @param {object} [options]
	 * @returns {void}
	 */
	function Model(data, options = {}) {
		BaseModel.call(this, data, options);
	}

	Object.setPrototypeOf(Model, BaseModel);
	Object.setPrototypeOf(Model.prototype, BaseModel.prototype);

	Model.model_name = model_name || model_options.table_name;
	Model.schema_instance = schema_instance;
	Model.model_options = model_options;
	Model.connection = connection_context || null;
	Model.prototype.connection = Model.connection;
	ensure_model_runtime_state(Model);

	Model.reset_index_cache = function () {
		reset_model_index_cache(Model);
	};

	Model.resolve_id_strategy = function () {
		const connection_options = resolve_model_connection_options(Model);
		const model_id_strategy = model_options.id_strategy;
		const server_id_strategy = connection_options.id_strategy;
		const final_id_strategy = model_id_strategy ?? server_id_strategy;

		assert_id_strategy(final_id_strategy);

		return final_id_strategy;
	};

	Model.resolve_auto_index = function () {
		const connection_options = resolve_model_connection_options(Model);
		const model_auto_index = model_options.auto_index;
		const server_auto_index = connection_options.auto_index;
		const final_auto_index = model_auto_index ?? server_auto_index;

		assert_condition(is_boolean(final_auto_index), 'auto_index must be a boolean');

		return final_auto_index;
	};

	install_migration_methods(Model, schema_instance, model_options);
	install_read_methods(Model);

	Model.create_document_from_row = function (row_value, options = {}) {
		return new Model({}, options).init(row_value, options);
	};

	Model.apply_document_row = function (target_document, row_value, options = {}) {
		if(is_not_object(target_document)) {
			return target_document;
		}

		return target_document.init(row_value, options);
	};

	Model.create = async function (documents) {
		if(is_array(documents)) {
			const created_documents = [];

			for(const document of documents) {
				const next_document = new Model(document || {});
				created_documents.push(await next_document.save());
			}

			return created_documents;
		}

		const next_document = new Model(documents || {});
		return next_document.save();
	};

	Model.from = function (input_data, options = {}) {
		// 1. Inspect the incoming shape, extract root base fields, and fold everything else into payload.
		// In `from(...)`, a root `data` key is treated like ordinary payload, not as a row envelope.
		const source_data = normalize_document_input(input_data, DocumentInputMode.From);

		// 2. Resolve strictness for this import. Per-call options override schema strictness here.
		const strict_mode = options.strict ?? schema_instance.strict;

		// 3. Shape the extracted payload according to the selected strictness rule.
		const payload_input = strict_mode
			? conform_payload_to_schema(schema_instance, source_data.payload)
			: filter_loose_payload(source_data.payload);

		// 4. Validate and cast the resulting payload through the schema.
		const normalized_payload = schema_instance.validate(payload_input);

		// 5. Build a new document. Base fields may be preserved, but this path keeps `is_new = true`.
		const next_document = new Model(normalized_payload, options);

		if(has_own(source_data.base_fields, 'id')) {
			next_document.id = source_data.base_fields.id;
		}

		if(has_own(source_data.base_fields, 'created_at')) {
			next_document.created_at = source_data.base_fields.created_at;
		}

		if(has_own(source_data.base_fields, 'updated_at')) {
			next_document.updated_at = source_data.base_fields.updated_at;
		}

		return next_document;
	};

	Model.hydrate = function (input_data, options = {}) {
		// 1. Inspect the incoming shape, extract outer base fields, and use `input_data.data` as payload when present.
		const source_data = normalize_document_input(input_data, DocumentInputMode.Hydrate);

		// 2. Resolve strictness for this hydrate input. Per-call options override schema strictness here too.
		const strict_mode = options.strict ?? schema_instance.strict;

		// 3. Shape the extracted payload according to the selected strictness rule.
		const payload_input = strict_mode
			? conform_payload_to_schema(schema_instance, source_data.payload)
			: filter_loose_payload(source_data.payload);

		// 4. Validate and cast the resulting payload through the schema.
		const normalized_payload = schema_instance.validate(payload_input);

		// 5. Build a persisted document. This path reconstructs row-backed state and sets `is_new = false`.
		return new Model({}, options).init({
			id: source_data.base_fields.id,
			data: normalized_payload,
			created_at: source_data.base_fields.created_at,
			updated_at: source_data.base_fields.updated_at
		}, options);
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
		resolve_supported_model_id_strategy(Model);
	}

	return Model;
}

export default model;
