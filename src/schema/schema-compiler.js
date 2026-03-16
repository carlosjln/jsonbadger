import field_definition_parser from '#src/schema/field-definition-parser.js';

import {
	create_path_introspection,
	get_path_field_type,
	get_path_type as resolve_path_type,
	is_array_root as resolve_is_array_root
} from '#src/schema/path-introspection.js';

import {is_array} from '#src/utils/array.js';
import {has_own} from '#src/utils/object.js';
import {is_not_object} from '#src/utils/value.js';

const schema_validation_error_message = 'Schema validation failed';
const schema_validation_error_code = 'validation_error';

function compile_schema(schema_definition = {}) {
	const parsed_schema = field_definition_parser(schema_definition);
	const path_introspection = create_path_introspection(parsed_schema);
	const field_types = path_introspection.field_types;
	const sorted_paths = Object.keys(field_types).sort(sort_paths_by_depth);

	return {
		validate: function (payload) {
			return validate_payload(payload, sorted_paths, field_types);
		},

		get_path: function (path_name) {
			return get_path_field_type(path_introspection, path_name);
		},

		get_path_type: function (path_name) {
			return resolve_path_type(path_introspection, path_name);
		},

		is_array_root: function (path_name) {
			return resolve_is_array_root(path_introspection, path_name);
		},

		get_introspection: function () {
			return path_introspection;
		}
	};
}

function validate_payload(payload, sorted_paths, field_types) {
	if(is_not_object(payload) || is_array(payload)) {
		return {
			valid: false,
			errors: [{
				path: '',
				code: schema_validation_error_code,
				message: schema_validation_error_message,
				type: 'object'
			}]
		};
	}

	const error_list = [];
	let path_index = 0;

	while(path_index < sorted_paths.length) {
		const path_name = sorted_paths[path_index];
		const field_type = field_types[path_name];
		const path_segments = path_name.split('.');
		const current_path_state = read_path(payload, path_segments);
		const current_value = current_path_state.exists ? current_path_state.value : undefined;

		if(is_function(field_type.validate)) {
			try {
				field_type.validate(current_value, {path: path_name, exists: current_path_state.exists});
			} catch(error) {
				error_list.push(format_field_error(path_name, error));
			}
		}

		path_index += 1;
	}

	return {
		valid: error_list.length === 0,
		errors: error_list.length > 0 ? error_list : null
	};
}

function sort_paths_by_depth(left_path, right_path) {
	const left_depth = left_path.split('.').length;
	const right_depth = right_path.split('.').length;

	if(left_depth !== right_depth) {
		return left_depth - right_depth;
	}

	return left_path.localeCompare(right_path);
}

function format_field_error(path_name, error) {
	const error_message = error && error.message ? error.message : schema_validation_error_message;
	const error_code = error && error.code ? error.code : schema_validation_error_code;

	return {
		path: path_name,
		code: error_code,
		message: error_message,
		type: error_code
	};
}

function read_path(root_object, path_segments) {
	let current_value = root_object;
	let segment_index = 0;

	while(segment_index < path_segments.length) {
		const segment_value = path_segments[segment_index];

		if(current_value === null || typeof current_value !== 'object' || !has_own(current_value, segment_value)) {
			return {
				exists: false,
				value: undefined
			};
		}

		current_value = current_value[segment_value];
		segment_index += 1;
	}

	return {
		exists: true,
		value: current_value
	};
}

function write_path(root_object, path_segments, next_value) {
	let current_value = root_object;
	let segment_index = 0;

	while(segment_index < path_segments.length) {
		const segment_value = path_segments[segment_index];
		const is_leaf = segment_index === path_segments.length - 1;

		if(is_leaf) {
			current_value[segment_value] = next_value;
			return;
		}

		if(!has_own(current_value, segment_value) || !is_plain_object(current_value[segment_value])) {
			current_value[segment_value] = {};
		}

		current_value = current_value[segment_value];
		segment_index += 1;
	}
}

function clone_value(value) {
	if(is_array(value)) {
		const cloned_array = [];
		let value_index = 0;

		while(value_index < value.length) {
			cloned_array.push(clone_value(value[value_index]));
			value_index += 1;
		}

		return cloned_array;
	}

	if(value instanceof Date) {
		return new Date(value.getTime());
	}

	if(Buffer.isBuffer(value)) {
		return Buffer.from(value);
	}

	if(value && typeof value === 'object') {
		const cloned_object = {};
		const object_entries = Object.entries(value);
		let entry_index = 0;

		while(entry_index < object_entries.length) {
			const object_entry = object_entries[entry_index];
			cloned_object[object_entry[0]] = clone_value(object_entry[1]);
			entry_index += 1;
		}

		return cloned_object;
	}

	return value;
}

export default compile_schema;
