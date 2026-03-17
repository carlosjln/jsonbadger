import QueryError from '#src/errors/query-error.js';
import IdStrategies from '#src/constants/id-strategies.js';
import {assert_id_strategy_capability} from '#src/connection/server-capabilities.js';

import ensure_index_sql from '#src/migration/ensure-index.js';
import resolve_schema_indexes from '#src/migration/schema-indexes-resolver.js';
import ensure_table_sql from '#src/migration/ensure-table.js';

import Document from '#src/model/document.js';
import {DocumentInputMode} from '#src/model/factory/constants.js';
import {filter_loose_payload, normalize_document_fields} from '#src/model/factory/document-builder.js';
import {compile_delete_one} from '#src/model/factory/delete-compiler.js';
import {compile_update_one} from '#src/model/factory/update-compiler.js';
import {base_field_keys, timestamp_fields} from '#src/model/factory/constants.js';

import QueryBuilder from '#src/query/query-builder.js';
import sql_runner from '#src/sql/sql-runner.js';
import {is_array} from '#src/utils/array.js';
import {quote_identifier} from '#src/utils/assert.js';
import {jsonb_stringify} from '#src/utils/json.js';
import {has_own} from '#src/utils/object.js';
import {split_dot_path} from '#src/utils/object-path.js';
import {is_function, is_not_object, is_object, is_string} from '#src/utils/value.js';

/**
 * Base model constructor that initializes the internal reactive document.
 *
 * @param {*} data
 * @param {object} [options]
 * @returns {void}
 */
function Model(data, options = {}) {
	this.document = new Document(data, options);
	this.is_new = true;
}

/*
 * DX ALIASES & GETTERS
 */
Object.defineProperty(Model.prototype, 'id', {
	get: function () {return this.document.id;},
	set: function (value) {this.document.id = value;}
});

Object.defineProperty(Model.prototype, 'created_at', {
	get: function () {return this.document.created_at;},
	set: function (value) {this.document.created_at = value;}
});

Object.defineProperty(Model.prototype, 'updated_at', {
	get: function () {return this.document.updated_at;},
	set: function (value) {this.document.updated_at = value;}
});

Object.defineProperty(Model.prototype, 'payload', {
	get: function () {return this.get_payload();}
});

Object.defineProperty(Model.prototype, 'timestamps', {
	get: function () {return this.get_timestamps();}
});

Model.options = null;
Model.state = null;
Model.prototype.is_new = null;

/**
 * Read one payload or base-field value by path or alias.
 *
 * @param {string} path_name
 * @param {object} [runtime_options]
 * @returns {*}
 */
Model.prototype.get = function (path_name, runtime_options) {
	const options = is_object(runtime_options) ? runtime_options : {};

	if(base_field_keys.has(path_name)) {
		return this[path_name];
	}

	const resolved_path = resolve_alias_path(this, path_name);
	const path_segments = split_dot_path(resolved_path);
	const path_state = read_document_path(this.document.data, path_segments);

	if(!path_state.exists) {
		return undefined;
	}

	const field_type = resolve_schema_field_type(this, resolved_path);
	const has_getter = is_function(field_type?.options?.get);

	if(options.getters === false || !has_getter) {
		return path_state.value;
	}

	return field_type.apply_get(path_state.value, {
		path: resolved_path,
		mode: 'get'
	});
};

/**
 * Set one payload or base-field value by path or alias.
 *
 * @param {string} path_name
 * @param {*} next_value
 * @param {object} [runtime_options]
 * @returns {Model}
 * @throws {QueryError}
 */
Model.prototype.set = function (path_name, next_value, runtime_options) {
	const options = is_object(runtime_options) ? runtime_options : {};
	const resolved_path = resolve_alias_path(this, path_name);
	const base_field_root_key = resolved_path.split('.')[0];

	if(base_field_root_key === 'id') {
		throw new QueryError('Read-only base field cannot be assigned by path mutation', {
			operation: 'set',
			field: base_field_root_key
		});
	}

	const is_timestamp = timestamp_fields.has(base_field_root_key);

	if(is_timestamp && resolved_path !== base_field_root_key) {
		throw new QueryError('Timestamp fields only support top-level paths', {
			operation: 'set',
			field: base_field_root_key,
			path: resolved_path
		});
	}

	const field_type = resolve_schema_field_type(this, resolved_path);
	let assigned_value = next_value;

	if(field_type) {
		if(options.setters !== false) {
			assigned_value = field_type.apply_set(assigned_value, {
				path: resolved_path,
				mode: 'set'
			});
		}

		if(options.cast !== false && is_function(field_type.cast)) {
			assigned_value = field_type.cast(assigned_value, {
				path: resolved_path,
				mode: 'set'
			});
		}
	}

	if(is_timestamp) {
		this[base_field_root_key] = assigned_value;
		return this;
	}

	if(is_not_object(this.document.data)) {
		this.document.data = {};
	}

	const path_segments = split_dot_path(resolved_path);
	write_document_path(this.document.data, path_segments, assigned_value);

	return this;
};

/**
 * Return payload data without row base fields.
 *
 * @returns {object}
 */
Model.prototype.get_payload = function () {
	const payload = Object.assign({}, this.document.data);

	delete payload.id;
	delete payload.created_at;
	delete payload.updated_at;

	return payload;
};

/**
 * Return document timestamp base fields.
 *
 * @returns {object}
 */
Model.prototype.get_timestamps = function () {
	return {
		created_at: this.created_at,
		updated_at: this.updated_at
	};
};

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
	const model_options = model.options;
	const table_name = model_options.table_name;
	const data_column = model_options.data_column;
	const table_identifier = quote_identifier(table_name);
	const data_identifier = quote_identifier(data_column);

	const document = this.document;

	// Make sure data and fields are valid right before saving
	model.schema.validate(document);

	apply_timestamps(document, this.is_new);

	// Create document path
	if(this.is_new) {
		const payload = this.payload;
		const base_fields = Object.assign({}, this.timestamps);

		if(model.schema.id_strategy === IdStrategies.uuidv7) {
			base_fields.id = this.id;
		}

		const insert_statement = create_insert_statement({table_identifier, data_identifier, payload, base_fields});
		const query_result = await sql_runner(insert_statement.sql_text, insert_statement.sql_params, model.connection);
		const saved_row = query_result.rows[0];

		document.init(saved_row);
		this.is_new = false;
		document.rebase_dirty_fields();

		return this;
	}

	// Update document path
	if(this.id === undefined || this.id === null) {
		throw new QueryError('Document id is required for save update operations', {
			operation: 'save',
			field: 'id'
		});
	}

	const update_set_payload = this.get_payload();

	if(document.has_dirty_fields()) {
		const updated_document = await model.update_one({id: this.id}, {$set: update_set_payload});

		if(updated_document) {
			document.init(updated_document);
			document.rebase_dirty_fields();
		}
	}

	return this;
};

/*
 * CONSTRUCTION
 */

/**
 * Build a new document from external input.
 *
 * @param {*} data
 * @param {object} [options]
 * @returns {object}
 */
Model.from = function (data, options = {}) {
	const model = this;
	const document = normalize_document_data(model, data, options, DocumentInputMode.From);

	// Validate the document state before building the instance.
	model.schema.validate(document);

	// Build a new document. This path keeps create semantics and leaves `is_new = true`.
	return new model(document, options);
};

/**
 * Build a persisted document from row-like input.
 *
 * @param {*} data
 * @param {object} [options]
 * @returns {object}
 */
Model.hydrate = function (data, options = {}) {
	const model = this;
	const doc = normalize_document_data(model, data, options, DocumentInputMode.Hydrate);

	// Validate the document state before building the instance.
	model.schema.validate(doc);

	// Build a persisted document. This path reconstructs row-backed state and sets `is_new = false`.
	const instance = new model(doc, options);
	instance.document.init(doc, options);
	instance.is_new = false;
	instance.document.rebase_dirty_fields();

	return instance;
};

/*
 * RUNTIME BOOKKEEPING
 */
Model.reset_index_cache = function () {
	this.state.indexes_ensured = false;
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
	const model_options = model.options;
	const table_name = model_options.table_name;
	const data_column = model_options.data_column;
	const id_strategy = model.schema.id_strategy;
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
	const model_options = model.options;
	const schema_indexes = resolve_schema_indexes(model.schema);

	if(model.state.indexes_ensured) {
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

	model.state.indexes_ensured = true;
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

// Build one validated document state for create or hydrate flows.
function normalize_document_data(model, input_data, options, input_mode) {
	const schema = model.schema;

	// Inspect the incoming shape and normalize it into one document state envelope.
	const document = normalize_document_fields(input_data, input_mode);

	// Resolve strictness for this input. Per-call options override schema strictness here too.
	const strict_mode = options.strict ?? schema.strict;

	// Shape the extracted data into the candidate payload for this lifecycle operation.
	const data = strict_mode ? document.data : filter_loose_payload(document.data);

	if(strict_mode) {
		schema.conform(data);
	}

	// Commit the candidate payload onto the normalized document state.
	document.data = data;

	return document;
}

function apply_timestamps(document, is_new) {
	const now = new Date();

	if(is_new) {
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

function create_insert_statement(statement_context) {
	const sql_columns = [statement_context.data_identifier];
	const sql_params = [jsonb_stringify(statement_context.payload)];
	const sql_values = ['$1::jsonb'];

	if(statement_context.base_fields.id !== undefined && statement_context.base_fields.id !== null) {
		sql_columns.push('id');
		sql_params.push(String(statement_context.base_fields.id));
		sql_values.push('$' + sql_params.length + '::uuid');
	}

	for(const key of ['created_at', 'updated_at']) {
		sql_columns.push(key);
		sql_params.push(statement_context.base_fields[key]);
		sql_values.push('$' + sql_params.length + '::timestamptz');
	}

	return {
		sql_text:
			'INSERT INTO ' + statement_context.table_identifier + ' (' + sql_columns.join(', ') + ') VALUES (' + sql_values.join(', ') + ') ' +
			'RETURNING id::text AS id, ' + statement_context.data_identifier + ' AS data, created_at AS created_at, updated_at AS updated_at',
		sql_params
	};
}

// Resolve one alias to its concrete schema path when the schema defines it.
function resolve_alias_path(model, path_name) {
	const schema = model.constructor.schema;

	if(!schema || is_not_object(schema.paths) || !is_function(schema.get_path)) {
		return path_name;
	}

	for(const [path, field_type] of Object.entries(schema.paths)) {
		const alias = field_type?.options?.alias;

		if(is_string(alias) && alias === path_name) {
			return path;
		}
	}

	return path_name;
}

// Resolve one schema field type for the provided path when available.
function resolve_schema_field_type(model, path_name) {
	const schema = model.constructor.schema;

	if(!schema || !is_function(schema.get_path)) {
		return null;
	}

	return schema.get_path(path_name) || null;
}

// Read one nested path from the provided payload root.
function read_document_path(root_object, path_segments) {
	let current = root_object;

	for(const segment of path_segments) {
		if(is_not_object(current) || !has_own(current, segment)) {
			return {
				exists: false,
				value: undefined
			};
		}

		current = current[segment];
	}

	return {
		exists: true,
		value: current
	};
}

// Write one nested path into the provided payload root.
function write_document_path(root_object, path_segments, next_value) {
	let current = root_object;
	const depth = path_segments.length - 1;

	for(let i = 0; i < depth; i++) {
		const segment = path_segments[i];

		if(is_not_object(current[segment])) {
			current[segment] = {};
		}

		current = current[segment];
	}

	const leaf_segment = path_segments[depth];
	current[leaf_segment] = next_value;
}

export default Model;
