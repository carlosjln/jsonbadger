import QueryError from '#src/errors/query-error.js';
import IdStrategies from '#src/constants/id-strategies.js';
import {assert_id_strategy_capability} from '#src/connection/server-capabilities.js';

import ensure_index_sql from '#src/migration/ensure-index.js';
import resolve_schema_indexes from '#src/migration/schema-indexes-resolver.js';
import ensure_table_sql from '#src/migration/ensure-table.js';

import Document from '#src/model/document.js';
import {base_field_keys, DocumentInputMode, timestamp_fields, unsafe_from_keys} from '#src/model/factory/constants.js';
import {exec_delete_one} from '#src/model/factory/exec-delete-one.js';
import {exec_insert_one} from '#src/model/factory/exec-insert-one.js';
import {exec_update_one} from '#src/model/factory/exec-update-one.js';

import QueryBuilder from '#src/query/query-builder.js';

import {is_array} from '#src/utils/array.js';
import {deep_clone, get_callable, has_own, to_plain_object} from '#src/utils/object.js';
import {split_dot_path} from '#src/utils/object-path.js';
import {is_function, is_not_object, is_object, is_plain_object} from '#src/utils/value.js';

/**
 * Base model constructor that initializes the internal reactive document.
 *
 * @param {*} data
 * @returns {void}
 */
function Model(data) {
	this.document = new Document(data);
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
	const aliases = this.constructor.schema.aliases;
	const alias_entry = aliases[path_name] || {};
	const resolved_path = alias_entry.path ?? path_name;

	if(base_field_keys.has(path_name)) {
		return this[path_name];
	}

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
	const aliases = this.constructor.schema.aliases;
	const alias_entry = aliases[path_name] || {};
	const resolved_path = alias_entry.path ?? path_name;
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
	const {id, created_at, updated_at, ...payload} = this.document.data;
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
 * Validate and persist this document through the compiled model.
 *
 * @returns {Promise<object>}
 * @throws {QueryError}
 */
Model.prototype.save = async function () {
	if(this.is_new) {
		return this.insert();
	}

	return this.update();
};

/**
 * Insert this model as a new persisted row.
 *
 * @returns {Promise<object>}
 * @throws {QueryError}
 */
Model.prototype.insert = async function () {
	const model = this.constructor;
	return model.insert_one(this);
};

/**
 * Update this model through the persisted row path.
 *
 * @returns {Promise<object>}
 * @throws {QueryError}
 */
Model.prototype.update = async function () {
	const model = this.constructor;
	const document = this.document;

	model.schema.validate(document);
	apply_timestamps(document, false);

	if(this.id === undefined || this.id === null) {
		throw new QueryError('Document id is required for save update operations', {
			operation: 'save',
			field: 'id'
		});
	}

	const update_set_payload = this.payload;

	if(document.has_dirty_fields()) {
		const updated_document = await exec_update_one(model, {id: this.id}, {$set: update_set_payload});

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
	return new model(document);
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
	const instance = new model(doc);
	instance.is_new = false;
	instance.document.init(doc);
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
		// Replace this fan-out with insert_many once a bulk insert path exists.
		return await Promise.all(documents.map((document) => {
			return model.insert_one(document);
		}));
	}

	return model.insert_one(documents);
};

/**
 * Insert one model instance or plain document input.
 *
 * @param {*|object} document_value
 * @returns {Promise<object>}
 * @throws {QueryError}
 */
Model.insert_one = async function (document_value) {
	const model = this;
	return exec_insert_one(model, document_value);
};

/**
 * Update one persisted document through the compiled model convenience API.
 *
 * @param {object|undefined} query_filter
 * @param {object|undefined} update_definition
 * @returns {Promise<object|null>}
 */
Model.update_one = async function (query_filter, update_definition) {
	const model = this;
	return exec_update_one(model, query_filter, update_definition);
};

Model.delete_one = async function (query_filter) {
	const model = this;
	return exec_delete_one(model, query_filter);
};

/*
 * SCHEMA / MIGRATION
 */
Model.ensure_model = async function () {
	const model = this;

	await model.ensure_table();

	if(!model.schema.auto_index) {
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
	const data = strict_mode ? document.data : strip_base_fields(document.data);

	if(strict_mode) {
		schema.conform(data);
	}

	// Commit the candidate payload onto the normalized document state.
	document.data = data;

	return document;
}

/**
 * Normalizes incoming data into a document-ready shape.
 *
 * Process:
 * - inspect incoming shape
 * - convert object-like input into a plain object when needed
 * - extract data/base fields using the selected mode
 * - return a document-ready normalized input object
 *
 * @param {*} input_data External input data.
 * @param {string} mode_value Input normalization mode.
 * @returns {{data: object, id: *, created_at: *, updated_at: *}}
 */
function normalize_document_fields(input_data, mode_value) {
	// 1. Guard against primitives, null, and arrays
	if(is_not_object(input_data)) {
		return {data: {}};
	}

	// 2. Convert class instances, Mongoose models, and custom objects into a plain object
	let source = input_data;

	// Its a class or constructor instance of some sort
	if(!is_plain_object(source)) {
		const serialize = get_callable(source, 'to_json', 'toJSON', to_plain_object);

		// Execute using .call() to pass 'this' for class methods, and 'source' as the first arg for utilities.
		source = serialize.call(source, source);
	}

	// Double check plain-object conversion succeeded before proceeding
	if(!is_plain_object(source)) {
		return {data: {}};
	}

	// Input contract:
	// - Model.from(...): extract root base fields and fold everything else into data
	// - Model.hydrate(...): extract root base fields and use `source.data` as payload when present
	const uses_row_payload = mode_value === DocumentInputMode.Hydrate && is_plain_object(source.data);
	const raw_data = uses_row_payload ? source.data : source;
	const data = deep_clone(raw_data);

	// Base fields are reserved at the document root for both modes.
	// In `from`, everything beyond those keys stays in data, including a root `data` key.
	// In `hydrate`, the root data comes from `source.data` when that envelope exists.
	if(!uses_row_payload) {
		for(const base_field_key of base_field_keys) {
			delete data[base_field_key];
		}
	}

	for(const unsafe_key of unsafe_from_keys) {
		delete data[unsafe_key];
	}

	const doc = {data};

	if(has_own(source, 'id')) {
		doc.id = source.id;
	}

	if(has_own(source, 'created_at')) {
		doc.created_at = source.created_at;
	}

	if(has_own(source, 'updated_at')) {
		doc.updated_at = source.updated_at;
	}

	return doc;
}

/**
 * Filters data keys without enforcing schema strictness.
 *
 * @param {object} data Source data object.
 * @returns {object}
 */
function strip_base_fields(data) {
	const {id, created_at, updated_at, ...sanitized_data} = data;
	return sanitized_data;
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
