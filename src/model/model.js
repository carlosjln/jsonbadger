import {assert_id_strategy_capability} from '#src/connection/server-capabilities.js';
import IdStrategies from '#src/constants/id-strategies.js';

import ensure_index_sql from '#src/migration/ensure-index.js';
import resolve_schema_indexes from '#src/migration/schema-indexes-resolver.js';
import ensure_table_sql from '#src/migration/ensure-table.js';

import Document from '#src/model/document.js';
import {DocumentInputMode} from '#src/model/factory/constants.js';
import {conform_payload_to_schema, filter_loose_payload, normalize_document_input} from '#src/model/factory/document-builder.js';
import {compile_delete_one} from '#src/model/factory/delete-compiler.js';
import {compile_update_one} from '#src/model/factory/update-compiler.js';

import QueryBuilder from '#src/query/query-builder.js';
import {is_array} from '#src/utils/array.js';

/**
 * Base model constructor that initializes through Document.
 *
 * @param {*} data
 * @param {object} [options]
 * @returns {void}
 */
function Model(data, options = {}) {
	Document.call(this, {data: data || {}}, options);
}

Object.setPrototypeOf(Model.prototype, Document.prototype);

Model.$options = null;
Model.$state = null;

/**
 * Build a new document from external input.
 *
 * @param {*} input_data
 * @param {object} [options]
 * @returns {object}
 */
Model.from = function (input_data, options = {}) {
	const model = this;
	const schema = model.schema;

	// 1. Inspect the incoming shape, extract root fields, and fold everything else into data.
	const doc = normalize_document_input(input_data, DocumentInputMode.From);

	// 2. Resolve strictness for this import. Per-call options override schema strictness here too.
	const strict_mode = options.strict ?? schema.strict;

	// 3. Shape the extracted data according to the selected strictness rule.
	doc.data = strict_mode ? conform_payload_to_schema(schema, doc.data) : filter_loose_payload(doc.data);

	// 4. Validate and cast the resulting data through the schema.
	doc.data = schema.validate(doc.data);

	// 5. Build a new document. This path keeps create semantics and leaves `is_new = true`.
	return new model(doc, options);
};

/**
 * Build a persisted document from row-like input.
 *
 * @param {*} input_data
 * @param {object} [options]
 * @returns {object}
 */
Model.hydrate = function (input_data, options = {}) {
	const model = this;
	const schema = model.schema;

	// 1. Inspect the incoming shape, extract outer root fields, and use `input_data.data` as data when present.
	const doc = normalize_document_input(input_data, DocumentInputMode.Hydrate);

	// 2. Resolve strictness for this hydrate input. Per-call options override schema strictness here too.
	const strict_mode = options.strict ?? schema.strict;

	// 3. Shape the extracted data according to the selected strictness rule.
	doc.data = strict_mode ? conform_payload_to_schema(schema, doc.data) : filter_loose_payload(doc.data);

	// 4. Validate and cast the resulting data through the schema.
	doc.data = schema.validate(doc.data);

	// 5. Build a persisted document. This path reconstructs row-backed state and sets `is_new = false`.
	return new model().init(doc, options);
};

/*
 * RUNTIME BOOKKEEPING
 */
Model.reset_index_cache = function () {
	this.$state.indexes_ensured = false;
};

/*
 * PERSISTENCE WRITES
 */
Model.create = async function (documents) {
	const model = this;

	if(is_array(documents)) {
		const created = [];

		for(const document of documents) {
			const doc = new model(document);
			created.push(await doc.save());
		}

		return created;
	}

	const doc = new model(documents);
	return await doc.save();
};

Model.update_one = async function (query_filter, update_definition) {
	const model = this;
	return compile_update_one(model, query_filter, update_definition);
};

Model.delete_one = async function (query_filter) {
	const model = this;
	return compile_delete_one(model, query_filter);
};

/*
 * SCHEMA / MIGRATION
 */
Model.ensure_model = async function () {
	const model = this;

	await model.ensure_table();

	if(!model.auto_index) {
		return;
	}

	await model.ensure_indexes();
};

Model.ensure_table = async function () {
	const model = this;
	const model_options = model.$options;
	const table_name = model_options.table_name;
	const data_column = model_options.data_column;
	const id_strategy = model.id_strategy;
	const server_capabilities = model.connection?.server_capabilities;

	// Some id strategies depend on server-side support, so verify capability before creating the table.
	if(id_strategy === IdStrategies.uuidv7 && server_capabilities) {
		assert_id_strategy_capability(id_strategy, server_capabilities);
	}

	await ensure_table_sql({
		table_name,
		data_column,
		id_strategy,
		connection: model.connection
	});
};

Model.ensure_indexes = async function () {
	const model = this;
	const model_options = model.$options;
	const schema_indexes = resolve_schema_indexes(model.schema);

	if(model.$state.indexes_ensured) {
		return;
	}

	for(const index_definition of schema_indexes) {
		await ensure_index_sql({
			table_name: model_options.table_name,
			index_definition,
			data_column: model_options.data_column,
			connection: model.connection
		});
	}

	model.$state.indexes_ensured = true;
};

/*
 * QUERY READS
 */
Model.find = function (query_filter) {
	return new QueryBuilder(this, 'find', query_filter || {});
};

Model.find_one = function (query_filter) {
	return new QueryBuilder(this, 'find_one', query_filter || {});
};

Model.find_by_id = function (id_value) {
	return new QueryBuilder(this, 'find_one', {id: id_value});
};

Model.count_documents = function (query_filter) {
	return new QueryBuilder(this, 'count_documents', query_filter || {});
};

export default Model;
