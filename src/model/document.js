import QueryError from '#src/errors/query-error.js';
import {base_field_keys, timestamp_fields} from '#src/model/factory/constants.js';
import {has_own} from '#src/utils/object.js';
import {split_dot_path} from '#src/utils/object-path.js';
import {is_function, is_not_object, is_object, is_string} from '#src/utils/value.js';

/**
 * Create one document instance from normalized state.
 *
 * @param {object} [document_state]
 * @param {object} [options]
 * @returns {void}
 */
function Document(document_state = {}, options = {}) {
	void options;

	this.data = document_state.data || {};
	this.id = document_state.id;
	this.created_at = document_state.created_at;
	this.updated_at = document_state.updated_at;
	this.is_new = true;
}

/**
 * Apply persisted row-like state onto this document.
 *
 * @param {object} [persisted_input]
 * @param {object} [options]
 * @returns {Document}
 */
Document.prototype.init = function (persisted_input = {}, options = {}) {
	void options;

	this.data = persisted_input.data || {};
	this.id = persisted_input.id;
	this.created_at = persisted_input.created_at;
	this.updated_at = persisted_input.updated_at;
	this.is_new = false;

	return this;
};

/**
 * Read one payload or base-field value by path or alias.
 *
 * @param {string} path_name
 * @param {object} [runtime_options]
 * @returns {*}
 */
Document.prototype.get = function (path_name, runtime_options) {
	const options = is_object(runtime_options) ? runtime_options : {};

	// Direct Access Check
	if(base_field_keys.has(path_name)) {
		return this[path_name];
	}

	// Resolve Path State
	const resolved_path = resolve_alias_path(this, path_name);
	const path_segments = split_dot_path(resolved_path);
	const path_state = read_document_path(this.data, path_segments);

	if(!path_state.exists) {
		return undefined;
	}

	// Getter Logic Check
	const field_type = resolve_schema_field_type(this, resolved_path);
	const has_getter = is_function(field_type?.options?.get);

	if(options.getters === false || !has_getter) {
		return path_state.value;
	}

	// Execute Getter
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
 * @returns {Document}
 * @throws {QueryError}
 */
Document.prototype.set = function (path_name, next_value, runtime_options) {
	const options = is_object(runtime_options) ? runtime_options : {};
	const resolved_path = resolve_alias_path(this, path_name);
	const base_field_root_key = resolved_path.split('.')[0];

	// Validate read-only id field
	if(base_field_root_key === 'id') {
		throw new QueryError('Read-only base field cannot be assigned by path mutation', {
			operation: 'set',
			field: base_field_root_key
		});
	}

	// Handle timestamp path constraints
	const is_timestamp = timestamp_fields.has(base_field_root_key);
	if(is_timestamp && resolved_path !== base_field_root_key) {
		throw new QueryError('Timestamp fields only support top-level paths', {
			operation: 'set',
			field: base_field_root_key,
			path: resolved_path
		});
	}

	// Resolve field type and apply transformations
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

	// Route assignment to prototype root or document data
	if(is_timestamp) {
		this[base_field_root_key] = assigned_value;
		return this;
	}

	if(is_not_object(this.data)) {
		this.data = {};
	}

	const path_segments = split_dot_path(resolved_path);
	write_document_path(this.data, path_segments, assigned_value);

	return this;
};

/**
 * Return payload data without row base fields.
 *
 * @returns {object}
 */
Document.prototype.get_payload = function () {
	const payload = Object.assign({}, this.data);

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
Document.prototype.get_timestamps = function () {
	return {
		created_at: this.created_at,
		updated_at: this.updated_at
	};
};

/*
 * DOCUMENT HELPERS
 */

// Resolve one alias to its concrete schema path when the schema defines it.
function resolve_alias_path(document, path_name) {
	const schema = document.constructor.schema;

	// Basic schema validation guard
	if(!schema || is_not_object(schema.paths) || !is_function(schema.get_path)) {
		return path_name;
	}

	// Iterate schema paths to find a matching alias
	for(const [path, field_type] of Object.entries(schema.paths)) {
		const alias = field_type?.options?.alias;

		if(is_string(alias) && alias === path_name) {
			return path;
		}
	}

	return path_name;
}

// Resolve one schema field type for the provided path when available.
function resolve_schema_field_type(document, path_name) {
	const schema = document.constructor.schema;

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

	// Traverse to the parent of the leaf node
	for(let i = 0; i < depth; i++) {
		const segment = path_segments[i];

		if(is_not_object(current[segment])) {
			current[segment] = {};
		}

		current = current[segment];
	}

	// Set the final value on the last segment
	const leaf_segment = path_segments[depth];
	current[leaf_segment] = next_value;
}

export default Document;
