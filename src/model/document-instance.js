import QueryError from '#src/errors/query-error.js';
import sql_runner from '#src/sql/sql-runner.js';
import {jsonb_stringify} from '#src/utils/json.js';
import {quote_identifier} from '#src/utils/assert.js';
import {deep_clone, has_own} from '#src/utils/object.js';
import {split_dot_path} from '#src/utils/object-path.js';
import {is_array} from '#src/utils/array.js';
import {is_not_object, is_object, is_string} from '#src/utils/value.js';

const runtime_state_symbol = Symbol('document_runtime_state');
const reserved_metadata_keys = new Set(['id', 'created_at', 'updated_at']);

export default function document_instance(model_constructor) {
	const schema_instance = model_constructor.schema_instance;
	const alias_path_map = build_alias_path_map(schema_instance);

	model_constructor.prototype.validate = function () {
		const validated_payload = schema_instance.validate(this.data);
		this.data = validated_payload;
		return this.data;
	};

	model_constructor.prototype.get = function (path_name, runtime_options) {
		const call_options = is_object(runtime_options) ? runtime_options : {};
		const resolved_path = resolve_alias_path(alias_path_map, path_name);
		const path_segments = split_dot_path(resolved_path);
		const path_state = read_existing_path(this.data, path_segments);

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

	model_constructor.prototype.set = function (path_name, next_value, runtime_options) {
		ensure_runtime_state(this);

		const call_options = is_object(runtime_options) ? runtime_options : {};
		const resolved_path = resolve_alias_path(alias_path_map, path_name);
		const path_segments = split_dot_path(resolved_path);
		const field_type = resolve_schema_field_type(schema_instance, resolved_path);
		const current_path_state = read_existing_path(this.data, path_segments);
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

		if(!is_object(this.data)) {
			this.data = {};
		}

		write_path(this.data, path_segments, assigned_value);
		mark_document_path_modified(this, resolved_path);
		return this;
	};

	model_constructor.prototype.mark_modified = function (path_name) {
		ensure_runtime_state(this);

		const resolved_path = resolve_alias_path(alias_path_map, path_name);
		split_dot_path(resolved_path);
		mark_document_path_modified(this, resolved_path);
		return this;
	};

	model_constructor.prototype.is_modified = function (path_name) {
		ensure_runtime_state(this);

		const runtime_state = this[runtime_state_symbol];

		if(path_name === undefined) {
			return runtime_state.modified_paths.size > 0;
		}

		const resolved_path = resolve_alias_path(alias_path_map, path_name);
		split_dot_path(resolved_path);
		return is_path_marked_modified(runtime_state.modified_paths, resolved_path);
	};

	model_constructor.prototype.clear_modified = function () {
		ensure_runtime_state(this);
		clear_document_modified_paths(this);
		return this;
	};

	define_alias_properties(model_constructor, alias_path_map);

	model_constructor.prototype.to_object = function (serialization_options) {
		return serialize_document(this, model_constructor, 'to_object', serialization_options);
	};

	model_constructor.prototype.to_json = function (serialization_options) {
		return serialize_document(this, model_constructor, 'to_json', serialization_options);
	};

	model_constructor.prototype.toJSON = function () {
		return this.to_json();
	};

	model_constructor.prototype.save = async function () {
		ensure_runtime_state(this);

		const {table_name, data_column} = model_constructor.model_options;
		const table_identifier = quote_identifier(table_name);
		const data_identifier = quote_identifier(data_column);
		const validated_payload = this.validate();

		assert_payload_has_no_reserved_metadata_writes(validated_payload, 'save');

		await model_constructor.ensure_table();

		const insert_statement = build_insert_statement(table_identifier, data_identifier, validated_payload);
		const query_result = await sql_runner(insert_statement.sql_text, insert_statement.sql_params);
		const saved_row = query_result.rows[0];
		const saved_data = shape_row_output(saved_row);

		this.data = sanitize_payload_data(saved_row.data);
		this.is_new = false;
		clear_document_modified_paths(this);
		return saved_data;
	};
}

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

function sanitize_payload_data(payload_value) {
	if(!is_object(payload_value)) {
		return {};
	}

	const sanitized_payload = {};

	for(const [key, next_value] of Object.entries(payload_value)) {
		if(!reserved_metadata_keys.has(key)) {
			sanitized_payload[key] = next_value;
		}
	}

	return sanitized_payload;
}

function shape_row_output(row_value) {
	const output_value = sanitize_payload_data(row_value?.data);

	output_value.id = row_value?.id == null ? row_value?.id : String(row_value.id);
	output_value.created_at = normalize_timestamp_value(row_value?.created_at);
	output_value.updated_at = normalize_timestamp_value(row_value?.updated_at);

	return output_value;
}

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

function assert_payload_has_no_reserved_metadata_writes(payload_value, operation_name) {
	if(!is_object(payload_value)) {
		return;
	}

	const reserved_keys = ['id', 'created_at', 'updated_at'];

	for(const key of reserved_keys) {
		if(has_own(payload_value, key)) {
			throw new QueryError('Reserved metadata fields are read-only', {
				operation: operation_name,
				field: key
			});
		}
	}
}

function serialize_document(document_instance, model_constructor, mode_value, serialization_options) {
	const schema_instance = model_constructor.schema_instance;
	const call_options = is_object(serialization_options) ? serialization_options : {};
	const schema_serialization_options = resolve_schema_serialization_options(schema_instance, mode_value);
	const apply_getters = resolve_getters_option(call_options, schema_serialization_options);
	let serialized_value = deep_clone(document_instance.data);

	if(apply_getters) {
		serialized_value = apply_schema_getters(serialized_value, schema_instance, mode_value);
	}

	const transform_function = resolve_transform_function(call_options, schema_serialization_options);

	if(typeof transform_function !== 'function') {
		return serialized_value;
	}

	const transform_result = transform_function.call(null, document_instance, serialized_value, {
		mode: mode_value
	});

	if(transform_result === undefined) {
		return serialized_value;
	}

	return transform_result;
}

function resolve_schema_serialization_options(schema_instance, mode_value) {
	if(!schema_instance || !is_object(schema_instance.options)) {
		return null;
	}

	const option_key = mode_value === 'to_json' ? 'to_json' : 'to_object';
	const option_value = schema_instance.options[option_key];

	if(!is_object(option_value)) {
		return null;
	}

	return option_value;
}

function resolve_getters_option(call_options, schema_serialization_options) {
	if(call_options.getters !== undefined) {
		return call_options.getters === true;
	}

	if(schema_serialization_options && schema_serialization_options.getters !== undefined) {
		return schema_serialization_options.getters === true;
	}

	return true;
}

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

		update_existing_path(serialized_value, path_segments, apply_getter);
	}

	return serialized_value;
}

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

function sort_paths_by_getter_order(left_path_entry, right_path_entry) {
	const left_depth = left_path_entry.depth;
	const right_depth = right_path_entry.depth;

	if(left_depth !== right_depth) {
		return right_depth - left_depth;
	}

	return left_path_entry.path_name.localeCompare(right_path_entry.path_name);
}

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

function resolve_alias_path(alias_path_map, path_name) {
	if(has_own(alias_path_map, path_name)) {
		return alias_path_map[path_name];
	}

	return path_name;
}

function resolve_schema_field_type(schema_instance, path_name) {
	if(!schema_instance || typeof schema_instance.path !== 'function') {
		return null;
	}

	return schema_instance.path(path_name);
}

function ensure_runtime_state(document_value) {
	if(typeof document_value.is_new !== 'boolean') {
		document_value.is_new = true;
	}

	if(!document_value[runtime_state_symbol]) {
		document_value[runtime_state_symbol] = {
			modified_paths: new Set()
		};
	}

	return document_value[runtime_state_symbol];
}

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

function mark_document_path_modified(document_value, path_name) {
	const runtime_state = ensure_runtime_state(document_value);
	runtime_state.modified_paths.add(path_name);
}

function clear_document_modified_paths(document_value) {
	const runtime_state = ensure_runtime_state(document_value);
	runtime_state.modified_paths.clear();
}

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

function is_parent_or_child_path(left_path, right_path) {
	return left_path.indexOf(right_path + '.') === 0 || right_path.indexOf(left_path + '.') === 0;
}

function read_existing_path(root_object, path_segments) {
	let current_value = root_object;

	for(const segment_value of path_segments) {
		if(is_not_object(current_value) || !has_own(current_value, segment_value)) {
			return {
				exists: false,
				value: undefined
			};
		}

		current_value = current_value[segment_value];
	}

	return {
		exists: true,
		value: current_value
	};
}

function write_path(root_object, path_segments, next_value) {
	let current_value = root_object;

	for(let segment_index = 0; segment_index < path_segments.length; segment_index++) {
		const segment_value = path_segments[segment_index];
		const is_leaf = segment_index === path_segments.length - 1;

		if(is_leaf) {
			current_value[segment_value] = next_value;
			return;
		}

		const has_segment = has_own(current_value, segment_value);
		const segment_value_ref = has_segment ? current_value[segment_value] : undefined;
		const should_create_container = !has_segment || is_not_object(segment_value_ref);

		if(should_create_container) {
			current_value[segment_value] = {};
		}

		current_value = current_value[segment_value];
	}
}

function update_existing_path(root_object, path_segments, update_value) {
	let current_value = root_object;

	for(let segment_index = 0; segment_index < path_segments.length; segment_index++) {
		const segment_value = path_segments[segment_index];
		const is_leaf = segment_index === path_segments.length - 1;

		if(is_not_object(current_value) || !has_own(current_value, segment_value)) {
			return {
				exists: false
			};
		}

		if(is_leaf) {
			current_value[segment_value] = update_value(current_value[segment_value]);
			return {
				exists: true
			};
		}

		current_value = current_value[segment_value];
	}
}
