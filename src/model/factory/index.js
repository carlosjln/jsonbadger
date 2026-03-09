import defaults from '#src/constants/defaults.js';
import IdStrategies, {assert_valid_id_strategy} from '#src/constants/id-strategies.js';

import ensure_index from '#src/migration/ensure-index.js';
import ensure_schema from '#src/migration/ensure-schema.js';
import resolve_schema_indexes from '#src/migration/schema-indexes-resolver.js';
import ensure_table from '#src/migration/ensure-table.js';

import document_instance from '#src/model/document-instance.js';
import {compile_delete_one} from '#src/model/factory/delete-compiler.js';
import {
	build_document_instance,
	normalize_payload,
	resolve_from_strict_mode,
	resolve_source_data
} from '#src/model/factory/from-runtime.js';
import {
	assert_model_id_strategy_supported,
	resolve_model_connection_options
} from '#src/model/factory/model-support.js';
import {compile_update_one} from '#src/model/factory/update-compiler.js';

import QueryBuilder from '#src/query/query-builder.js';

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

	let indexes_ensured = false;

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

	Model.ensure_table = async function () {
		const final_table_name = model_options.table_name;
		const final_id_strategy = Model.assert_id_strategy_supported();

		await ensure_table(final_table_name, model_options.data_column, final_id_strategy, Model.connection);

		if(indexes_ensured || !Model.resolve_auto_index()) {
			return;
		}

		await ensure_schema_indexes(Model, schema_instance, model_options);
		indexes_ensured = true;
	};

	Model.ensure_index = async function () {
		const final_table_name = model_options.table_name;
		const final_id_strategy = Model.assert_id_strategy_supported();

		await ensure_table(final_table_name, model_options.data_column, final_id_strategy, Model.connection);
		await ensure_schema_indexes(Model, schema_instance, model_options);

		indexes_ensured = true;
	};

	Model.ensure_schema = async function () {
		const final_id_strategy = Model.assert_id_strategy_supported();
		await ensure_schema(model_options.table_name, model_options.data_column, schema_instance, final_id_strategy, Model.connection);
		indexes_ensured = true;
	};

	Model.find = function (query_filter, projection_value) {
		return new QueryBuilder(Model, 'find', query_filter || {}, projection_value || null);
	};

	Model.find_one = function (query_filter) {
		return new QueryBuilder(Model, 'find_one', query_filter || {}, null);
	};

	Model.find_by_id = function (id_value) {
		return new QueryBuilder(Model, 'find_one', {id: id_value}, null);
	};

	Model.count_documents = function (query_filter) {
		return new QueryBuilder(Model, 'count_documents', query_filter || {}, null);
	};

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

	/**
	 * Ensures all schema-defined indexes exist for this model.
	 *
	 * @param {Function} model_constructor Model constructor.
	 * @param {object} next_schema_instance Schema instance.
	 * @param {object} next_model_options Model options.
	 * @returns {Promise<void>}
	 */
	async function ensure_schema_indexes(model_constructor, next_schema_instance, next_model_options) {
		const schema_indexes = resolve_schema_indexes(next_schema_instance);

		for(const index_definition of schema_indexes) {
			await ensure_index(
				next_model_options.table_name,
				index_definition,
				next_model_options.data_column,
				model_constructor.connection
			);
		}
	}

	const connection_options = resolve_model_connection_options(Model);
	const eager_id_strategy = model_options.id_strategy ?? connection_options.id_strategy;

	if(eager_id_strategy === IdStrategies.uuidv7) {
		Model.assert_id_strategy_supported();
	}

	return Model;
}

export default model;

