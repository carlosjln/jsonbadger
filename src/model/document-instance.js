import QueryError from '#src/errors/query-error.js';
import sql_runner from '#src/sql/sql-runner.js';
import {jsonb_stringify} from '#src/utils/json.js';
import {assert_path, quote_identifier} from '#src/utils/assert.js';
import {deep_clone, has_own} from '#src/utils/object.js';
import {split_dot_path} from '#src/utils/object-path.js';
import {is_array} from '#src/utils/array.js';
import {is_not_object, is_object, is_string} from '#src/utils/value.js';

const runtime_state_symbol = Symbol('document_runtime_state');
const metadata_key_list = Object.freeze(['id', 'created_at', 'updated_at']);
const metadata_key_set = new Set(metadata_key_list);

/**
 * Reserved metadata policy used across validate/mutate/hydrate/serialize flows.
 *
 * Lifecycle relevance:
 * - `validate` / `persist`: blocks writes to reserved metadata keys.
 * - `mutate`: blocks path writes where root is reserved.
 * - `hydrate` / `serialize`: strips reserved keys from payload objects.
 *
 * Example:
 * - payload `{ id: 'custom', name: 'ana' }` becomes `{ name: 'ana' }`.
 */
const metadata_policy = Object.freeze({
	keys: metadata_key_list,

	/** @lifecycle validate */
	has_key: function (key_value) {
		return metadata_key_set.has(key_value);
	},

	/** @lifecycle validate */
	resolve_root_key: function (path_name) {
		if(typeof path_name !== 'string' || path_name.length === 0) {
			return null;
		}

		return path_name.split('.')[0];
	},

	/** @lifecycle validate */
	has_reserved_root: function (path_name) {
		const root_key = metadata_policy.resolve_root_key(path_name);
		return root_key !== null && metadata_key_set.has(root_key);
	},

	/** @lifecycle hydrate,serialize */
	strip_payload: function (payload_value) {
		if(is_not_object(payload_value)) {
			return {};
		}

		const sanitized_payload = deep_clone(payload_value);

		for(const key of metadata_policy.keys) {
			delete sanitized_payload[key];
		}

		return sanitized_payload;
	},

	/** @lifecycle validate,persist */
	assert_no_payload_writes: function (payload_value, operation_name) {
		if(is_not_object(payload_value)) {
			return;
		}

		for(const key of metadata_policy.keys) {
			if(has_own(payload_value, key)) {
				throw new QueryError('Reserved metadata fields are read-only', {
					operation: operation_name,
					field: key
				});
			}
		}
	},

	/** @lifecycle validate,mutate */
	assert_writable_path: function (path_name, operation_name) {
		const root_key = metadata_policy.resolve_root_key(path_name);

		if(root_key && metadata_policy.has_key(root_key)) {
			throw new QueryError('Reserved metadata fields are read-only', {
				operation: operation_name,
				field: root_key
			});
		}
	}
});

/**
 * Shared path runtime operations used by get/set/getter-serialization flows.
 *
 * Example:
 * - `write({}, ['profile', 'name'], 'ana')` creates `{ profile: { name: 'ana' } }`.
 */
const path_runtime = Object.freeze({
	/** @lifecycle runtime-ready */
	read: function (root_object, path_segments) {
		return run_path_operation('read', root_object, path_segments, null);
	},

	/** @lifecycle mutate */
	write: function (root_object, path_segments, next_value) {
		run_path_operation('write', root_object, path_segments, next_value);
	},

	/** @lifecycle mutate,serialize */
	update_existing: function (root_object, path_segments, update_value) {
		return run_path_operation('update_existing', root_object, path_segments, update_value);
	}
});

/**
 * Attach model document runtime behavior.
 *
 * Lifecycle relevance:
 * - construct/runtime-ready: installs static and instance APIs.
 * - mutate/persist/hydrate/serialize: all runtime phases route through installed methods.
 *
 * @param {Function} model_constructor
 * @returns {void}
 */
export default function document_instance(model_constructor) {
	const schema_instance = model_constructor.schema_instance;
	const alias_path_map = build_alias_path_map(schema_instance);

	install_static_methods(model_constructor);
	install_instance_methods(model_constructor, schema_instance, alias_path_map);
	install_property_proxies(model_constructor, schema_instance, alias_path_map);
}

/**
 * Install static hydration helpers on model constructor.
 *
 * Lifecycle relevance:
 * - hydrate: map DB row shape into document instance shape.
 *
 * @param {Function} model_constructor
 * @returns {void}
 */
function install_static_methods(model_constructor) {
	/**
	 * Build a document instance from one SQL row.
	 *
	 * Example row:
	 * - `{ id: 7, data: { name: 'ana' }, created_at: Date, updated_at: Date }`
	 */
	model_constructor.create_document_from_row = function (row_value) {
		const payload_data = metadata_policy.strip_payload(row_value?.data);
		const next_document = new model_constructor(payload_data);
		apply_row_state(next_document, row_value);
		return next_document;
	};

	/**
	 * Apply one SQL row onto an existing document instance.
	 *
	 * Example use:
	 * - reusing an existing doc object after manual row fetch.
	 */
	model_constructor.apply_document_row = function (target_document, row_value) {
		apply_row_state(target_document, row_value);
		return target_document;
	};
}

/**
 * Install instance methods on model prototype.
 *
 * Lifecycle relevance:
 * - validate: `validate`
 * - mutate: `set`, `mark_modified`, `is_modified`, `clear_modified`
 * - persist/hydrate: `save`
 * - serialize: `to_object`, `to_json`, `toJSON`
 *
 * @param {Function} model_constructor
 * @param {object} schema_instance
 * @param {Record<string, string>} alias_path_map
 * @returns {void}
 */
function install_instance_methods(model_constructor, schema_instance, alias_path_map) {
	/**
	 * Validate and cast `doc.data` against schema.
	 *
	 * Example:
	 * - input `{ age: '30' }` may become `{ age: 30 }`.
	 */
	model_constructor.prototype.validate = function () {
		const validated_payload = schema_instance.validate(this.data);
		this.data = validated_payload;
		return this.data;
	};

	/**
	 * Read payload or metadata by path/alias.
	 *
	 * Examples:
	 * - `doc.get('profile.city') -> 'miami'`
	 * - `doc.get('id') -> '7'`
	 */
	model_constructor.prototype.get = function (path_name, runtime_options) {
		const call_options = is_object(runtime_options) ? runtime_options : {};

		if(metadata_policy.has_key(path_name)) {
			return read_metadata(this, path_name);
		}

		const resolved_path = resolve_alias_path(alias_path_map, path_name);
		const path_segments = split_dot_path(resolved_path);
		const path_state = path_runtime.read(this.data, path_segments);

		if(!path_state.exists) {
			return undefined;
		}

		const field_type = resolve_schema_field_type(schema_instance, resolved_path);

		if(call_options.getters === false) {
			return path_state.value;
		}

		if(!field_type || !field_type.options || typeof field_type.options.get !== 'function') {
			return path_state.value;
		}

		return field_type.apply_get(path_state.value, {
			path: resolved_path,
			mode: 'get'
		});
	};

	/**
	 * Set payload by path/alias with setters/casting and dirty tracking.
	 *
	 * Example:
	 * - `doc.set('profile.city', 'orlando')` marks `profile.city` modified.
	 */
	model_constructor.prototype.set = function (path_name, next_value, runtime_options) {
		init_runtime_state(this);

		const call_options = is_object(runtime_options) ? runtime_options : {};
		const resolved_path = resolve_alias_path(alias_path_map, path_name);

		metadata_policy.assert_writable_path(resolved_path, 'set');

		const path_segments = split_dot_path(resolved_path);
		const field_type = resolve_schema_field_type(schema_instance, resolved_path);
		const current_path_state = path_runtime.read(this.data, path_segments);

		let assigned_value = next_value;

		if(field_type) {
			if(call_options.setters !== false) {
				assigned_value = field_type.apply_set(assigned_value, {
					path: resolved_path,
					mode: 'set'
				});
			}

			if(call_options.cast !== false && typeof field_type.cast === 'function') {
				assigned_value = field_type.cast(assigned_value, {
					path: resolved_path,
					mode: 'set'
				});
			}
		}

		assert_immutable_write_allowed(this, field_type, resolved_path, current_path_state, assigned_value);

		if(current_path_state.exists && Object.is(current_path_state.value, assigned_value)) {
			return this;
		}

		if(is_not_object(this.data)) {
			this.data = {};
		}

		path_runtime.write(this.data, path_segments, assigned_value);
		mark_document_path_modified(this, resolved_path);
		return this;
	};

	/**
	 * Mark a path modified without changing value.
	 *
	 * Example:
	 * - in-place mutation: `doc.data.payload.flags.push('vip')`
	 * - then: `doc.mark_modified('payload.flags')`
	 */
	model_constructor.prototype.mark_modified = function (path_name) {
		init_runtime_state(this);

		const resolved_path = resolve_alias_path(alias_path_map, path_name);
		metadata_policy.assert_writable_path(resolved_path, 'mark_modified');
		assert_path(resolved_path, 'path');
		mark_document_path_modified(this, resolved_path);
		return this;
	};

	/**
	 * Check modified state globally or for one path subtree.
	 *
	 * Examples:
	 * - `doc.is_modified() -> true|false`
	 * - `doc.is_modified('profile') -> true|false`
	 */
	model_constructor.prototype.is_modified = function (path_name) {
		init_runtime_state(this);

		const runtime_state = this[runtime_state_symbol];

		if(path_name === undefined) {
			return runtime_state.modified_paths.size > 0;
		}

		const resolved_path = resolve_alias_path(alias_path_map, path_name);
		assert_path(resolved_path, 'path');
		return is_path_marked_modified(runtime_state.modified_paths, resolved_path);
	};

	/**
	 * Clear all modified path markers.
	 */
	model_constructor.prototype.clear_modified = function () {
		init_runtime_state(this);
		clear_document_modified_paths(this);
		return this;
	};

	/**
	 * Serialize to plain object shape.
	 *
	 * Example output:
	 * - `{ id, created_at, updated_at, ...data }`
	 */
	model_constructor.prototype.to_object = function (serialization_options) {
		return serialize_document(this, model_constructor, 'to_object', serialization_options);
	};

	/**
	 * Serialize to JSON-ready plain object shape.
	 *
	 * Example output:
	 * - `{ id, created_at, updated_at, ...data }`
	 */
	model_constructor.prototype.to_json = function (serialization_options) {
		return serialize_document(this, model_constructor, 'to_json', serialization_options);
	};

	/**
	 * JSON.stringify hook.
	 */
	model_constructor.prototype.toJSON = function () {
		return this.to_json();
	};

	/**
	 * Persist document via INSERT and hydrate returned DB state.
	 *
	 * Lifecycle:
	 * - validate -> persist -> hydrate -> runtime-ready
	 *
	 * Example:
	 * - returns same instance with metadata populated: `doc.id`, `doc.created_at`, `doc.updated_at`.
	 */
	model_constructor.prototype.save = async function () {
		init_runtime_state(this);

		const {table_name, data_column} = model_constructor.model_options;
		const table_identifier = quote_identifier(table_name);
		const data_identifier = quote_identifier(data_column);
		const validated_payload = this.validate();

		metadata_policy.assert_no_payload_writes(validated_payload, 'save');

		await model_constructor.ensure_table();

		const insert_statement = build_insert_statement(table_identifier, data_identifier, validated_payload);
		const query_result = await sql_runner(insert_statement.sql_text, insert_statement.sql_params);
		const saved_row = query_result.rows[0];

		apply_row_state(this, saved_row);

		return this;
	};
}

/**
 * Install property proxies:
 * - reserved metadata properties (`id`, `created_at`, `updated_at`)
 * - schema root properties (`doc.name`, `doc.profile`, ...)
 * - alias properties (`doc.alias_name`)
 *
 * Lifecycle relevance:
 * - construct/runtime-ready
 */
function install_property_proxies(model_constructor, schema_instance, alias_path_map) {
	define_metadata_properties(model_constructor);
	define_schema_root_properties(model_constructor, schema_instance);
	define_alias_properties(model_constructor, alias_path_map);
}

/**
 * Build SQL insert statement for validated payload.
 *
 * Example:
 * - input payload `{ name: 'ana' }`
 * - param list: `['{\"name\":\"ana\"}']`
 */
function build_insert_statement(table_identifier, data_identifier, validated_payload) {
	const serialized_payload = jsonb_stringify(validated_payload);
	const sql_text =
		'INSERT INTO ' + table_identifier + ' (' + data_identifier + ') VALUES ($1::jsonb) ' +
		'RETURNING id::text AS id, ' + data_identifier + ' AS data, created_at AS created_at, updated_at AS updated_at';
	const sql_params = [serialized_payload];

	return {
		sql_text: sql_text,
		sql_params: sql_params
	};
}

/**
 * Normalize timestamp values into ISO strings.
 *
 * Examples:
 * - `Date('2026-02-28T00:00:00.000Z') -> '2026-02-28T00:00:00.000Z'`
 * - invalid value -> stringified fallback
 */
function normalize_timestamp_value(timestamp_value) {
	if(timestamp_value == null) {
		return timestamp_value;
	}

	if(timestamp_value instanceof Date) {
		return timestamp_value.toISOString();
	}

	const parsed_timestamp = new Date(timestamp_value);

	if(Number.isNaN(parsed_timestamp.getTime())) {
		return String(timestamp_value);
	}

	return parsed_timestamp.toISOString();
}

/**
 * Central serializer for `to_object` and `to_json`.
 *
 * Lifecycle relevance:
 * - serialize
 *
 * Output shape example:
 * - `{ id: '7', created_at: '...', updated_at: '...', name: 'ana' }`
 */
function serialize_document(document_instance, model_constructor, mode_value, serialization_options) {
	const schema_instance = model_constructor.schema_instance;
	const call_options = is_object(serialization_options) ? serialization_options : {};
	const schema_serialization_options = resolve_schema_serialization_options(schema_instance, mode_value);
	const apply_getters = resolve_getters_option(call_options, schema_serialization_options);
	let serialized_data = deep_clone(document_instance.data);

	if(apply_getters) {
		serialized_data = apply_schema_getters(serialized_data, schema_instance, mode_value);
	}

	if(is_object(serialized_data)) {
		serialized_data = metadata_policy.strip_payload(serialized_data);
		append_defined_metadata(serialized_data, document_instance);
	}

	const transform_function = resolve_transform_function(call_options, schema_serialization_options);

	if(typeof transform_function !== 'function') {
		return serialized_data;
	}

	const transform_result = transform_function.call(null, document_instance, serialized_data, {
		mode: mode_value
	});

	if(transform_result === undefined) {
		return serialized_data;
	}

	return transform_result;
}

/**
 * Resolve schema serialization options for selected mode.
 */
function resolve_schema_serialization_options(schema_instance, mode_value) {
	if(!schema_instance || is_not_object(schema_instance.options)) {
		return null;
	}

	const option_key = mode_value === 'to_json' ? 'to_json' : 'to_object';
	const option_value = schema_instance.options[option_key];

	if(is_not_object(option_value)) {
		return null;
	}

	return option_value;
}

/**
 * Resolve getter execution flag for serialization.
 */
function resolve_getters_option(call_options, schema_serialization_options) {
	if(call_options.getters !== undefined) {
		return call_options.getters === true;
	}

	if(schema_serialization_options && schema_serialization_options.getters !== undefined) {
		return schema_serialization_options.getters === true;
	}

	return true;
}

/**
 * Resolve serialization transform function from call or schema options.
 */
function resolve_transform_function(call_options, schema_serialization_options) {
	if(call_options.transform === false) {
		return null;
	}

	if(typeof call_options.transform === 'function') {
		return call_options.transform;
	}

	if(schema_serialization_options && typeof schema_serialization_options.transform === 'function') {
		return schema_serialization_options.transform;
	}

	return null;
}

/**
 * Apply schema getters across serialized payload paths.
 *
 * Example:
 * - getter on `name` can transform `'ana' -> 'ANA'`.
 */
function apply_schema_getters(serialized_value, schema_instance, mode_value) {
	if(!schema_instance || typeof schema_instance.path !== 'function') {
		return serialized_value;
	}

	if(is_not_object(serialized_value)) {
		return serialized_value;
	}

	const path_names = resolve_schema_paths(schema_instance);

	for(const path_name of path_names) {
		const field_type = schema_instance.path(path_name);

		if(!field_type || !field_type.options || typeof field_type.options.get !== 'function') {
			continue;
		}

		const path_segments = path_name.split('.');
		const apply_getter = (current_path_value) => {
			return field_type.apply_get(current_path_value, {
				path: path_name,
				mode: mode_value
			});
		};

		path_runtime.update_existing(serialized_value, path_segments, apply_getter);
	}

	return serialized_value;
}

/**
 * Return schema paths sorted deepest-first for stable nested getter updates.
 */
function resolve_schema_paths(schema_instance) {
	const schema_description = schema_instance.schema_description;

	if(!schema_description || !is_array(schema_description.paths)) {
		return [];
	}

	return schema_description.paths
		.map(path_name => ({
			path_name: path_name,
			depth: path_name.split('.').length
		}))
		.sort(sort_paths_by_getter_order)
		.map(entry => entry.path_name);
}

/**
 * Sort helper for getter path ordering.
 */
function sort_paths_by_getter_order(left_path_entry, right_path_entry) {
	const left_depth = left_path_entry.depth;
	const right_depth = right_path_entry.depth;

	if(left_depth !== right_depth) {
		return right_depth - left_depth;
	}

	return left_path_entry.path_name.localeCompare(right_path_entry.path_name);
}

/**
 * Build alias->path lookup from schema field options.
 *
 * Example:
 * - alias `city_name` -> path `profile.city`
 */
function build_alias_path_map(schema_instance) {
	const alias_path_map = Object.create(null);
	const schema_description = schema_instance && schema_instance.schema_description;

	if(!schema_description || !is_array(schema_description.paths) || typeof schema_instance.path !== 'function') {
		return alias_path_map;
	}

	for(const path_name of schema_description.paths) {
		const field_type = schema_instance.path(path_name);
		const alias_value = field_type && field_type.options ? field_type.options.alias : undefined;

		if(!is_string(alias_value) || alias_value.length === 0) {
			continue;
		}

		if(has_own(alias_path_map, alias_value) && alias_path_map[alias_value] !== path_name) {
			throw new Error('Duplicate alias "' + alias_value + '" for paths "' + alias_path_map[alias_value] + '" and "' + path_name + '"');
		}

		alias_path_map[alias_value] = path_name;
	}

	return alias_path_map;
}

/**
 * Define alias properties on prototype for non-dotted aliases.
 */
function define_alias_properties(model_constructor, alias_path_map) {
	for(const alias_name of Object.keys(alias_path_map)) {
		if(alias_name.indexOf('.') !== -1) {
			continue;
		}

		if(alias_name in model_constructor.prototype) {
			throw new Error('Alias "' + alias_name + '" conflicts with an existing document property');
		}

		Object.defineProperty(model_constructor.prototype, alias_name, {
			configurable: true,
			enumerable: false,
			get: function () {
				return this.get(alias_name);
			},
			set: function (next_value) {
				this.set(alias_name, next_value);
			}
		});
	}
}

/**
 * Resolve alias to concrete schema path.
 */
function resolve_alias_path(alias_path_map, path_name) {
	if(has_own(alias_path_map, path_name)) {
		return alias_path_map[path_name];
	}

	return path_name;
}

/**
 * Resolve schema field type by path.
 */
function resolve_schema_field_type(schema_instance, path_name) {
	if(!schema_instance || typeof schema_instance.path !== 'function') {
		return null;
	}

	return schema_instance.path(path_name);
}

/**
 * Ensure runtime state container exists.
 *
 * Lifecycle relevance:
 * - runtime-ready boundary used by mutate/hydrate methods.
 */
function init_runtime_state(document_value) {
	if(typeof document_value.is_new !== 'boolean') {
		document_value.is_new = true;
	}

	if(!document_value[runtime_state_symbol]) {
		document_value[runtime_state_symbol] = {
			modified_paths: new Set(),
			metadata: {
				id: undefined,
				created_at: undefined,
				updated_at: undefined
			}
		};
	}

	return document_value[runtime_state_symbol];
}

/**
 * Define enumerable schema-root property proxies on prototype.
 *
 * Example:
 * - schema path `profile.city` defines root proxy `doc.profile`.
 */
function define_schema_root_properties(model_constructor, schema_instance) {
	const root_keys = resolve_schema_root_keys(schema_instance);

	for(const root_key of root_keys) {
		if(metadata_policy.has_key(root_key)) {
			continue;
		}

		if(root_key in model_constructor.prototype) {
			continue;
		}

		Object.defineProperty(model_constructor.prototype, root_key, {
			configurable: true,
			enumerable: true,
			get: function () {
				return this.get(root_key, {getters: false});
			},
			set: function (next_value) {
				this.set(root_key, next_value);
			}
		});
	}
}

/**
 * Resolve unique schema root keys from dotted schema paths.
 *
 * Example:
 * - paths `['profile.city', 'profile.country', 'name']` -> `['profile', 'name']`.
 */
function resolve_schema_root_keys(schema_instance) {
	const schema_paths = schema_instance?.schema_description?.paths;

	if(!is_array(schema_paths)) {
		return [];
	}

	const root_keys = [];
	const seen_keys = new Set();

	for(const path_name of schema_paths) {
		if(typeof path_name !== 'string' || path_name.length === 0) {
			continue;
		}

		const root_key = path_name.split('.')[0];

		if(!seen_keys.has(root_key)) {
			seen_keys.add(root_key);
			root_keys.push(root_key);
		}
	}

	return root_keys;
}

/**
 * Apply DB row state into document runtime state.
 *
 * Lifecycle relevance:
 * - hydrate
 *
 * Example row:
 * - `{ id: 7, data: { name: 'ana' }, created_at: Date, updated_at: Date }`
 */
function apply_row_state(document_value, row_value) {
	if(is_not_object(document_value)) {
		return document_value;
	}

	document_value.data = metadata_policy.strip_payload(row_value?.data);
	document_value.is_new = false;

	set_metadata(document_value, 'id', normalize_id_value(row_value?.id));
	set_metadata(document_value, 'created_at', normalize_timestamp_value(row_value?.created_at));
	set_metadata(document_value, 'updated_at', normalize_timestamp_value(row_value?.updated_at));

	clear_document_modified_paths(document_value);
	return document_value;
}

/**
 * Normalize id to string when defined.
 */
function normalize_id_value(id_value) {
	if(id_value === undefined || id_value === null) {
		return id_value;
	}

	return String(id_value);
}

/**
 * Define read-only metadata properties on prototype.
 *
 * Example usage:
 * - `doc.id`, `doc.created_at`, `doc.updated_at`
 */
function define_metadata_properties(model_constructor) {
	for(const metadata_key of metadata_policy.keys) {
		if(metadata_key in model_constructor.prototype) {
			continue;
		}

		Object.defineProperty(model_constructor.prototype, metadata_key, {
			configurable: true,
			enumerable: true,
			get: function () {
				return read_metadata(this, metadata_key);
			},
			set: function () {
				throw new QueryError('Reserved metadata fields are read-only', {
					operation: 'set',
					field: metadata_key
				});
			}
		});
	}
}

/**
 * Read one metadata value from runtime state.
 */
function read_metadata(document_value, metadata_key) {
	const runtime_state = init_runtime_state(document_value);
	return runtime_state.metadata[metadata_key];
}

/**
 * Set one metadata value in runtime state.
 */
function set_metadata(document_value, metadata_key, metadata_value) {
	const runtime_state = init_runtime_state(document_value);
	runtime_state.metadata[metadata_key] = metadata_value;
}

/**
 * Append defined metadata fields into serialized output.
 */
function append_defined_metadata(output_value, document_value) {
	for(const metadata_key of metadata_policy.keys) {
		const metadata_value = read_metadata(document_value, metadata_key);

		if(metadata_value !== undefined) {
			output_value[metadata_key] = metadata_value;
		}
	}
}

/**
 * Enforce immutable field behavior after first persist.
 */
function assert_immutable_write_allowed(document_value, field_type, path_name, current_path_state, assigned_value) {
	if(!field_type || !field_type.options || field_type.options.immutable !== true) {
		return;
	}

	if(document_value.is_new === true) {
		return;
	}

	const current_value = current_path_state.exists ? current_path_state.value : undefined;

	if(Object.is(current_value, assigned_value)) {
		return;
	}

	throw new Error('Path "' + path_name + '" is immutable');
}

/**
 * Mark one path as modified in runtime state.
 */
function mark_document_path_modified(document_value, path_name) {
	const runtime_state = init_runtime_state(document_value);
	runtime_state.modified_paths.add(path_name);
}

/**
 * Clear modified-path tracking.
 */
function clear_document_modified_paths(document_value) {
	const runtime_state = init_runtime_state(document_value);
	runtime_state.modified_paths.clear();
}

/**
 * Check whether path is directly or hierarchically modified.
 */
function is_path_marked_modified(modified_paths, path_name) {
	if(modified_paths.has(path_name)) {
		return true;
	}

	for(const modified_path of modified_paths) {
		if(is_parent_or_child_path(modified_path, path_name)) {
			return true;
		}
	}

	return false;
}

/**
 * Determine parent/child relation between two dotted paths.
 */
function is_parent_or_child_path(left_path, right_path) {
	return left_path.indexOf(right_path + '.') === 0 || right_path.indexOf(left_path + '.') === 0;
}


/**
 * Shared path walker for read/write/update operations.
 *
 * Lifecycle relevance:
 * - runtime-ready read path access
 * - mutate path writes
 * - serialize getter updates
 *
 * Examples:
 * - `run_path_operation('read', {a:{b:1}}, ['a','b']) -> { exists: true, value: 1 }`
 * - `run_path_operation('write', {}, ['a','b'], 1)` mutates root to `{ a: { b: 1 } }`
 */
function run_path_operation(operation_name, root_object, path_segments, operation_value) {
	let current_value = root_object;

	for(let segment_index = 0; segment_index < path_segments.length; segment_index++) {
		const segment_value = path_segments[segment_index];
		const is_leaf = segment_index === path_segments.length - 1;

		if(operation_name === 'write') {
			if(is_not_object(current_value)) {
				return {exists: false};
			}

			if(is_leaf) {
				current_value[segment_value] = operation_value;
				return {exists: true};
			}

			const has_segment = has_own(current_value, segment_value);
			const segment_value_ref = has_segment ? current_value[segment_value] : undefined;
			const should_create_container = !has_segment || is_not_object(segment_value_ref);

			if(should_create_container) {
				current_value[segment_value] = {};
			}

			current_value = current_value[segment_value];
			continue;
		}

		if(is_not_object(current_value) || !has_own(current_value, segment_value)) {
			if(operation_name === 'read') {
				return {
					exists: false,
					value: undefined
				};
			}

			return {exists: false};
		}

		if(is_leaf) {
			if(operation_name === 'read') {
				return {
					exists: true,
					value: current_value[segment_value]
				};
			}

			current_value[segment_value] = operation_value(current_value[segment_value]);

			return {
				exists: true
			};
		}

		current_value = current_value[segment_value];
	}

	if(operation_name === 'read') {
		return {
			exists: false,
			value: undefined
		};
	}

	return {exists: false};
}
