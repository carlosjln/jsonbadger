import QueryError from '#src/errors/query-error.js';
import ValidationError from '#src/errors/validation-error.js';
import IdStrategies from '#src/constants/id-strategies.js';
import {assert_id_strategy_capability} from '#src/connection/server-capabilities.js';

import ensure_index_sql from '#src/migration/ensure-index.js';
import resolve_schema_indexes from '#src/migration/schema-indexes-resolver.js';
import ensure_table_sql from '#src/migration/ensure-table.js';

import Document from '#src/model/document.js';
import {DocumentInputMode} from '#src/model/factory/constants.js';
import {conform_payload_to_schema, filter_loose_payload, normalize_document_input} from '#src/model/factory/document-builder.js';
import {compile_delete_one} from '#src/model/factory/delete-compiler.js';
import {compile_update_one} from '#src/model/factory/update-compiler.js';

import QueryBuilder from '#src/query/query-builder.js';
import sql_runner from '#src/sql/sql-runner.js';
import {is_array} from '#src/utils/array.js';
import {quote_identifier} from '#src/utils/assert.js';
import {jsonb_stringify} from '#src/utils/json.js';
import {is_uuid_v7, is_valid_timestamp} from '#src/utils/value.js';

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

/*
 * INSTANCE WRITES
 */

/**
 * Validate and persist this document through the compiled model runtime.
 *
 * @returns {Promise<object>}
 * @throws {QueryError}
 */
Model.prototype.save = async function () {
	const model = this.constructor;
	const model_options = model.$options;
	const table_name = model_options.table_name;
	const data_column = model_options.data_column;
	const table_identifier = quote_identifier(table_name);
	const data_identifier = quote_identifier(data_column);

	// Make sure data and fields are valid right before saving
	model.schema.validate(this.data);
	apply_timestamps(this);
	assert_base_fields(this, model);

	// Create document path
	if(this.is_new) {
		const payload = this.get_payload();
		const base_fields = Object.assign({}, resolve_insert_id(this), this.get_timestamps());
		const insert_statement = create_insert_statement({table_identifier, data_identifier, payload, base_fields});
		const query_result = await sql_runner(insert_statement.sql_text, insert_statement.sql_params, model.connection);
		const saved_row = query_result.rows[0];

		return this.init(saved_row);
	}

	// Update document path
	if(this.id === undefined || this.id === null) {
		throw new QueryError('Document id is required for save update operations', {
			operation: 'save',
			field: 'id'
		});
	}

	const update_set_payload = this.get_payload();
	update_set_payload.updated_at = this.updated_at;

	if(Object.keys(update_set_payload).length === 0) {
		return this;
	}

	const updated_document = await model.update_one({id: this.id}, {
		$set: update_set_payload
	});

	if(updated_document) {
		this.init({
			id: updated_document.id,
			data: updated_document.data,
			created_at: updated_document.created_at,
			updated_at: updated_document.updated_at
		});
	}

	return this;
};

/*
 * CONSTRUCTION
 */

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

	// 3. Shape the extracted data into the candidate payload for this create operation.
	const data = strict_mode ? conform_payload_to_schema(schema, doc.data) : filter_loose_payload(doc.data);

	// 4. Validate the candidate payload before committing it onto the document state.
	schema.validate(data);
	assert_base_fields(doc, model);

	// 5. Commit the validated payload onto the normalized document state.
	doc.data = data;

	// 6. Build a new document. This path keeps create semantics and leaves `is_new = true`.
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

	// 3. Shape the extracted data into the candidate payload for this hydrate operation.
	const data = strict_mode ? conform_payload_to_schema(schema, doc.data) : filter_loose_payload(doc.data);

	// 4. Validate the candidate payload before committing it onto the document state.
	schema.validate(data);
	assert_base_fields(doc, model);

	// 5. Commit the validated payload onto the normalized document state.
	doc.data = data;

	// 6. Build a persisted document. This path reconstructs row-backed state and sets `is_new = false`.
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

/**
 * Build and persist one or many new documents.
 *
 * @param {*|Array<*>} documents
 * @returns {Promise<object|Array<object>>}
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

/*
 * MODEL HELPERS
 */

/**
 * Apply write-time timestamp rules onto a document instance.
 *
 * @param {object} document
 * @returns {void}
 */
function apply_timestamps(document) {
	const now = new Date().toISOString();

	if(document.is_new) {
		if(document.created_at === undefined || document.created_at === null) {
			document.created_at = now;
		}

		if(document.updated_at === undefined || document.updated_at === null) {
			document.updated_at = now;
		}

		return;
	}

	document.updated_at = now;
}

// Validate the model-resolved top-level base fields before construction or persistence.
function assert_base_fields(document, model) {
	const error_details = [];

	// Helper to DRY up the error object creation
	const add_error = (path, msg, val) => error_details.push({
		path, code: 'validator_error', message: msg, type: 'validator_error', value: val
	});

	// UUID Check
	if(model.id_strategy === IdStrategies.uuidv7 && document.id != null && !is_uuid_v7(document.id)) {
		add_error('id', 'Path "id" must be a valid UUIDv7', document.id);
	}

	// Timestamp Checks (Single-pass loop)
	for(const key of ['created_at', 'updated_at']) {
		const val = document[key];
		if(val != null && !is_valid_timestamp(val)) {
			add_error(key, `Path "${key}" must be a valid timestamp`, val);
		}
	}

	if(error_details.length) {
		throw new ValidationError('Schema validation failed', error_details);
	}
}

/**
 * Resolve the id fields that should participate in INSERT.
 *
 * @param {object} document
 * @returns {object}
 */
function resolve_insert_id(document) {
	if(document.constructor.id_strategy === IdStrategies.uuidv7) {
		return {id: document.id};
	}

	return {};
}

/**
 * Compile an INSERT statement from the provided document write context.
 *
 * @param {object} statement_context
 * @param {string} statement_context.table_identifier
 * @param {string} statement_context.data_identifier
 * @param {object} statement_context.payload
 * @param {object} statement_context.base_fields
 * @returns {{sql_text: string, sql_params: Array<*>}}
 */
function create_insert_statement(statement_context) {
	const sql_columns = [statement_context.data_identifier];
	const sql_values = ['$1::jsonb'];
	const sql_params = [jsonb_stringify(statement_context.payload)];
	let next_param_index = 2;

	if(statement_context.base_fields.id !== undefined && statement_context.base_fields.id !== null) {
		sql_columns.push('id');
		sql_values.push('$' + next_param_index + '::uuid');
		sql_params.push(String(statement_context.base_fields.id));
		next_param_index += 1;
	}

	sql_columns.push('created_at');
	sql_values.push('$' + next_param_index + '::timestamptz');
	sql_params.push(statement_context.base_fields.created_at);
	next_param_index += 1;

	sql_columns.push('updated_at');
	sql_values.push('$' + next_param_index + '::timestamptz');
	sql_params.push(statement_context.base_fields.updated_at);

	return {
		sql_text:
			'INSERT INTO ' + statement_context.table_identifier + ' (' + sql_columns.join(', ') + ') VALUES (' + sql_values.join(', ') + ') ' +
			'RETURNING id::text AS id, ' + statement_context.data_identifier + ' AS data, created_at AS created_at, updated_at AS updated_at',
		sql_params
	};
}

export default Model;
