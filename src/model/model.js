/*
 * MODULE RESPONSIBILITY
 * Own document lifecycle, schema validation, timestamp policy, and persistence delegation.
 */
import ID_STRATEGY from '#src/constants/id-strategy.js';
import INTAKE_MODE from '#src/constants/intake-mode.js';
import QueryError from '#src/errors/query-error.js';

import ensure_index_sql from '#src/migration/ensure-index.js';
import ensure_table_sql from '#src/migration/ensure-table.js';
import resolve_schema_indexes from '#src/migration/schema-indexes-resolver.js';

import Document from '#src/model/document.js';
import QueryBuilder from '#src/model/operations/query-builder.js';
import DeltaTracker from '#src/utils/delta-tracker/index.js';

import {exec_delete_one} from '#src/model/operations/delete-one.js';
import {exec_insert_one} from '#src/model/operations/insert-one.js';
import {exec_update_one} from '#src/model/operations/update-one.js';
import {base_field_keys, timestamp_fields, unsafe_from_keys} from '#src/model/factory/constants.js';

import {is_array} from '#src/utils/array.js';
import {expand_dot_paths, read_nested_path, split_dot_path, write_nested_path} from '#src/utils/object-path.js';
import {deep_clone, get_callable, has_own, to_plain_object} from '#src/utils/object.js';
import {is_function, is_not_object, is_object, is_plain_object} from '#src/utils/value.js';

/**
 * Base model constructor that initializes the internal tracked document.
 *
 * @param {*} data
 * @returns {void}
 */
function Model(data) {
	const slugs = this.constructor.schema.get_slugs();
	this.document = DeltaTracker(new Document(data), {track: slugs});
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

Object.defineProperty(Model.prototype, 'timestamps', {
	get: function () {
		return {
			created_at: this.created_at,
			updated_at: this.updated_at
		};
	}
});

Model.options = null;
Model.state = null;
Model.prototype.is_new = null;

/**
 * Read one document value by exact path or alias.
 *
 * @param {string} path_name
 * @returns {*}
 */
Model.prototype.get = function (path_name) {
	const aliases = this.constructor.schema.aliases;
	const alias_entry = aliases[path_name] || {};
	const resolved_path = alias_entry.path ?? path_name;
	const segments = split_dot_path(resolved_path);

	if(segments.length === 1) {
		return this.document[segments[0]] ?? null;
	}

	const path_state = read_nested_path(this.document, segments);

	if(!path_state.exists) {
		return undefined;
	}

	return path_state.value;
};

/**
 * Set one document value by exact path or alias.
 *
 * Schema-aware setter and cast logic still run before assignment.
 *
 * @param {string} path_name
 * @param {*} next_value
 * @returns {Model}
 * @throws {QueryError}
 */
Model.prototype.set = function (path_name, next_value) {
	const schema = this.constructor.schema;
	const aliases = schema.aliases;
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

	const field_type_path = resolve_field_type_path(schema, resolved_path);
	const field_type = schema.get_path(field_type_path) || null;
	let assigned_value = next_value;

	if(field_type) {
		assigned_value = field_type.apply_set(assigned_value, {
			path: resolved_path,
			mode: 'set'
		});

		if(is_function(field_type.cast)) {
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

	const path_segments = split_dot_path(resolved_path);
	write_nested_path(this.document, path_segments, assigned_value);

	return this;
};

/**
 * Bind live document-backed fields onto another target object.
 *
 * Default-slug root fields are flattened onto the target root, while
 * registered extra slugs stay nested at their slug root.
 *
 * @param {object} target
 * @returns {object}
 */
Model.prototype.bind_document = function (target) {
	const schema = this.constructor.schema;
	const default_slug = schema.get_default_slug();
	const extra_slugs = schema.get_extra_slugs();
	const extra_slug_set = new Set(extra_slugs);
	const seen_root_fields = new Set();
	const proxied_fields = [...base_field_keys, ...extra_slugs];

	if(is_not_object(target)) {
		throw new Error('bind_document target must be an object');
	}

	for(const path_name of Object.keys(schema.$field_types)) {
		const root_field = split_dot_path(path_name)[0];

		if(base_field_keys.has(root_field) || extra_slug_set.has(root_field) || seen_root_fields.has(root_field)) {
			continue;
		}

		seen_root_fields.add(root_field);
		proxied_fields.push(root_field);
	}

	for(const field_name of proxied_fields) {
		if(has_own(target, field_name)) {
			throw new Error('bind_document field collision: ' + field_name);
		}

		let get_value;
		let set_value;

		if(base_field_keys.has(field_name)) {
			get_value = () => this[field_name] ?? null;
			set_value = (value) => {
				this[field_name] = value;
			};
		} else if(extra_slug_set.has(field_name)) {
			get_value = () => this.get(field_name);
			set_value = (value) => {
				this.set(field_name, value);
			};
		} else {
			const path_name = default_slug + '.' + field_name;
			get_value = () => this.get(path_name);
			set_value = (value) => {
				this.set(path_name, value);
			};
		}

		Object.defineProperty(target, field_name, {
			enumerable: true,
			configurable: true,
			get: get_value,
			set: set_value
		});
	}

	return target;
};

/**
 * Conform the current tracked document state to the schema-owned document shape.
 *
 * @param {object} [options]
 * @returns {Model}
 */
Model.prototype.$conform_document = function () {
	this.constructor.schema.conform(this.document);
	return this;
};

/**
 * Apply schema defaults onto the current tracked document state.
 *
 * @param {object} [options]
 * @returns {Model}
 */
Model.prototype.$apply_defaults = function (options = {}) {
	const schema = this.constructor.schema;
	const document = this.document;
	const default_slug = schema.get_default_slug();
	const extra_slug_set = new Set(schema.get_extra_slugs());

	for(const [path_name, field_type] of Object.entries(schema.$field_types)) {
		const path_segments = split_dot_path(path_name);
		const root_key = path_segments[0];
		let target_root = document;
		let target_segments = path_segments;

		if(!base_field_keys.has(root_key)) {
			const target_key = extra_slug_set.has(root_key) ? root_key : default_slug;
			const has_target_root = has_own(document, target_key);

			if(has_target_root && is_not_object(document[target_key])) {
				continue;
			}

			if(!has_target_root) {
				document[target_key] = {};
			}

			target_root = document[target_key];

			if(target_key === root_key) {
				target_segments = path_segments.slice(1);
			}
		}

		const leaf_key = target_segments[target_segments.length - 1];
		const depth = target_segments.length - 1;

		let current_object = target_root;
		let write_index = null;
		let path_exists = true;
		let can_write = true;

		for(const [index, segment] of target_segments.entries()) {
			if(index >= depth) {
				break;
			}

			if(!has_own(current_object, segment)) {
				path_exists = false;
				write_index = index;
				break;
			}

			if(is_not_object(current_object[segment])) {
				can_write = false;
				write_index = index;
				break;
			}

			current_object = current_object[segment];
			write_index = index + 1;
		}

		if(!can_write) {
			continue;
		}

		if(path_exists && has_own(current_object, leaf_key)) {
			continue;
		}

		const default_value = field_type.resolve_default({
			...options,
			path: path_name,
			document,
			model: this
		});

		if(default_value === undefined) {
			continue;
		}

		if(write_index === null) {
			write_index = 0;
		}

		for(const segment of target_segments.slice(write_index, depth)) {
			current_object[segment] = {};
			current_object = current_object[segment];
		}

		current_object[leaf_key] = deep_clone(default_value);
	}

	return this;
};

/**
 * Cast existing schema-backed values on the current tracked document state.
 *
 * @param {object} [options]
 * @returns {Model}
 */
Model.prototype.$cast = function (options = {}) {
	const schema = this.constructor.schema;
	const document = this.document;
	const default_slug = schema.get_default_slug();
	const extra_slug_set = new Set(schema.get_extra_slugs());

	for(const [path_name, field_type] of Object.entries(schema.$field_types)) {
		const path_segments = split_dot_path(path_name);
		const root_key = path_segments[0];
		let target_root = document;
		let target_segments = path_segments;

		if(!base_field_keys.has(root_key)) {
			const target_key = extra_slug_set.has(root_key) ? root_key : default_slug;
			const has_target_root = has_own(document, target_key);
			const target_value = document[target_key];

			if(!has_target_root || is_not_object(target_value)) {
				continue;
			}

			target_root = target_value;

			if(target_key === root_key) {
				target_segments = path_segments.slice(1);
			}
		}

		const path_state = read_nested_path(target_root, target_segments);

		if(!path_state.exists) {
			continue;
		}

		const cast_context = {
			...options,
			path: path_name,
			mode: 'cast',
			document,
			model: this
		};

		let casted_value = path_state.value;
		casted_value = field_type.apply_set(casted_value, cast_context);
		casted_value = field_type.cast(casted_value, cast_context);

		write_nested_path(target_root, target_segments, casted_value);
	}

	return this;
};

/**
 * Validate the current tracked document state against schema rules.
 *
 * @param {object} [options]
 * @returns {Model}
 */
Model.prototype.$validate = function (options = {}) {
	void options;

	this.constructor.schema.validate(this.document);

	return this;
};

/**
 * Apply the full schema lifecycle to the current tracked document state.
 *
 * @param {object} [options]
 * @returns {Model}
 */
Model.prototype.$normalize = function (options = {}) {
	this.$conform_document(options);
	this.$apply_defaults(options);
	this.$cast(options);
	this.$validate(options);

	return this;
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
	const document = this.document;
	const data_column = model.options.data_column;

	model.schema.validate(document);
	apply_timestamps(document);

	const base_fields = {
		created_at: document.created_at,
		updated_at: document.updated_at
	};

	if(model.schema.id_strategy === ID_STRATEGY.uuidv7) {
		base_fields.id = document.id;
	}

	const data = {
		payload: document[data_column],
		base_fields
	};
	const saved_row = await exec_insert_one(model, data);

	if(saved_row) {
		this.rebase(new Document(saved_row));
	}

	return this;
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
	document.updated_at = new Date();

	if(this.id === undefined || this.id === null) {
		throw new QueryError('Document id is required for save update operations', {
			operation: 'save',
			field: 'id'
		});
	}

	if(document.$has_changes()) {
		// The tracker provides the delta shape, and row-level timestamps stay at the root.
		const update_payload = document.$get_delta();
		update_payload.updated_at = document.updated_at;

		const filter = {id: this.id};
		const updated_row = await exec_update_one(model, filter, update_payload);

		if(updated_row) {
			this.rebase(new Document(updated_row));
		}
	}

	return this;
};

Model.prototype.rebase = function (reference) {
	let document;

	if(reference instanceof Model) {
		document = reference.document;
	} else if(reference instanceof Document) {
		document = reference;
	} else {
		throw new Error('rebase reference must be a Model or Document');
	}

	const data = deep_clone(document);

	this.is_new = false;
	this.document.init(data);
	this.document.$rebase_changes();

	return this;
};

/*
 * CONSTRUCTION
 */

/**
 * Build a new document from external payload input.
 *
 * @param {*} data
 * @param {object} [options]
 * @returns {object}
 */
Model.from = function (data, options = {}) {
	const model = this;
	const fields = extract_from_document_fields(model, data);
	const instance = new model(fields);

	// Build a new document, then run the composed lifecycle on the tracked instance state.
	instance.$normalize({mode: INTAKE_MODE.from, ...options});
	instance.document.$rebase_changes();

	return instance;
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
	const fields = extract_hydrated_document_fields(model, data);
	const instance = new model(fields);

	// Build a persisted document, then run the composed lifecycle on the tracked instance state.
	instance.$normalize({mode: INTAKE_MODE.hydrate, ...options});
	instance.document.$rebase_changes();
	instance.is_new = false;

	return instance;
};

Model.cast = function (document) {
	return this.schema.cast(document);
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
 * Insert one plain payload input through the compiled model convenience API.
 *
 * @param {*|object} record
 * @returns {Promise<object>}
 * @throws {QueryError}
 */
Model.insert_one = async function (record) {
	const model = this;
	if(!is_plain_object(record)) {
		throw new Error('Model.insert_one accepts only plain object; use doc.insert() or doc.save() for existing documents');
	}

	const instance = model.from(record);
	return instance.insert();
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
	const row = await exec_update_one(model, query_filter, update_definition);

	if(row) {
		return model.hydrate(row);
	}

	return null;
};

Model.delete_one = async function (query_filter) {
	const model = this;
	const row = await exec_delete_one(model, query_filter);

	if(row) {
		return model.hydrate(row);
	}

	return null;
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
	const identity_runtime = model.schema.$runtime.identity;

	await ensure_table_sql({
		table_name,
		data_column,
		identity_runtime,
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

// Resolve one explicit document path into the matching schema field path.
function resolve_field_type_path(schema, resolved_path) {
	const path_segments = split_dot_path(resolved_path);
	const root_key = path_segments[0];

	if(base_field_keys.has(root_key) || schema.get_extra_slugs().includes(root_key)) {
		return resolved_path;
	}

	if(root_key === schema.get_default_slug()) {
		return path_segments.slice(1).join('.');
	}

	return resolved_path;
}

/**
 * Extract root base fields and route registered slug roots out of payload data.
 *
 * @param {Function} model
 * @param {*} input_data External input data.
 * @returns {object}
 */
function extract_from_document_fields(model, input_data) {
	const schema = model.schema;
	const default_slug = schema.get_default_slug();

	// 1. Guard against primitives, null, and arrays
	if(is_not_object(input_data)) {
		return {
			[default_slug]: {}
		};
	}

	// 2. Convert class instances, models, and custom objects into a plain object
	let source = input_data;

	// Its a class or constructor instance of some sort
	if(!is_plain_object(source)) {
		const serialize = get_callable(source, 'to_json', 'toJSON', to_plain_object);

		// Execute using .call() to pass 'this' for class methods, and 'source' as the first arg for utilities.
		source = serialize.call(source, source);
	}

	// Double check plain-object conversion succeeded before proceeding
	if(!is_plain_object(source)) {
		return {
			[default_slug]: {}
		};
	}

	// 3. Expand dotted payload keys at the public input boundary.
	source = expand_dot_paths(source);

	const registered_slug_keys = schema.get_extra_slugs();
	const registered_slug_set = new Set(registered_slug_keys);
	const document = {
		[default_slug]: {}
	};

	// 4. Route root keys in one pass into base fields, registered slugs, or the default slug.
	for(const [key, value] of Object.entries(source)) {
		if(base_field_keys.has(key)) {
			document[key] = value;
			continue;
		}

		if(unsafe_from_keys.has(key)) {
			continue;
		}

		if(registered_slug_set.has(key)) {
			document[key] = deep_clone(value);
			continue;
		}

		document[default_slug][key] = value;
	}

	// 5. Deep-clone the default slug payload so the normalized document owns its state.
	document[default_slug] = deep_clone(document[default_slug]);

	return document;
}

/**
 * Extract row-like input without applying payload-style dot-path routing.
 *
 * @param {Function} model
 * @param {*} input_data
 * @returns {object|null}
 */
function extract_hydrated_document_fields(model, input_data) {
	if(is_not_object(input_data)) {
		return null;
	}

	let source = input_data;

	if(!is_plain_object(source)) {
		const serialize = get_callable(source, 'to_json', 'toJSON', to_plain_object);
		source = serialize.call(source, source);
	}

	if(!is_plain_object(source)) {
		return null;
	}

	const schema = model.schema;
	const default_slug = schema.get_default_slug();
	const slugs = schema.get_slugs();
	const document = {};

	for(const base_field_key of base_field_keys) {
		if(has_own(source, base_field_key)) {
			document[base_field_key] = source[base_field_key];
		}
	}

	for(const slug_key of slugs) {
		const slug_value = is_plain_object(source[slug_key]) ? source[slug_key] : {};
		document[slug_key] = deep_clone(slug_value);
	}

	for(const unsafe_key of unsafe_from_keys) {
		delete document[default_slug][unsafe_key];
	}

	return document;
}

function apply_timestamps(document) {
	const now = new Date();

	if(document.created_at === undefined || document.created_at === null) {
		document.created_at = now;
	}

	document.updated_at = now;
}

export default Model;

