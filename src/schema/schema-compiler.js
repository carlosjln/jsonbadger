/*
Assumptions and trade-offs:
- Validation/casting is FieldType-driven and unknown payload keys are preserved.
- Error aggregation mirrors abortEarly=false behavior with deterministic per-path detail records.
*/
import field_definition_parser from '#src/schema/field-definition-parser.js';
import {
	create_path_introspection,
	get_path_field_type,
	get_path_type as resolve_path_type,
	is_array_root as resolve_is_array_root
} from '#src/schema/path-introspection.js';
import {has_own} from '#src/utils/object.js';
export default function schema_compiler(schema_definition) {
	const parsed_schema = field_definition_parser(schema_definition || {});
	const path_introspection = create_path_introspection(parsed_schema);
	const field_types = path_introspection.field_types;
	const sorted_paths = Object.keys(field_types).sort(sort_paths_by_depth);

	return {
		validate: function (payload) {
			return validate_payload(payload, sorted_paths, field_types);
		},
		path: function (path_name) {
			return get_path_field_type(path_introspection, path_name);
		},
		get_path_type: function (path_name) {
			return resolve_path_type(path_introspection, path_name);
		},
		is_array_root: function (path_name) {
			return resolve_is_array_root(path_introspection, path_name);
		},
		describe: function () {
			return {
				paths: Object.keys(field_types),
				objects: Array.from(path_introspection.object_paths)
			};
		}
	};
}

function validate_payload(payload, sorted_paths, field_types) {
	if(payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
		return {
			value: payload,
			error: {
				details: [{
					path: '',
					code: 'validation_error',
					message: 'Schema validation failed',
					type: 'object'
				}]
			}
		};
	}

	const result_payload = clone_value(payload);
	const detail_list = [];
	let path_index = 0;

	while(path_index < sorted_paths.length) {
		const path_name = sorted_paths[path_index];
		const field_type = field_types[path_name];
		const path_segments = path_name.split('.');
		const current_path_state = read_path(result_payload, path_segments);
		const current_value = current_path_state.exists ? current_path_state.value : undefined;
		let normalized_value = undefined;

		try {
			normalized_value = field_type.normalize(current_value, {path: path_name});
		} catch(error) {
			detail_list.push(format_field_error(path_name, error));
			path_index += 1;
			continue;
		}

		if(normalized_value === undefined) {
			path_index += 1;
			continue;
		}

		write_path(result_payload, path_segments, normalized_value);
		path_index += 1;
	}

	if(detail_list.length > 0) {
		return {
			value: result_payload,
			error: {
				details: detail_list
			}
		};
	}

	return {
		value: result_payload,
		error: null
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
	const error_message = error && error.message ? error.message : 'Schema validation failed';
	const error_code = error && error.code ? error.code : 'validation_error';

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

		// TODO: implement a code review agent that catches these 
		if(
			!has_own(current_value, segment_value) ||
			current_value[segment_value] === null ||
			typeof current_value[segment_value] !== 'object' ||
			Array.isArray(current_value[segment_value])
		) {
			current_value[segment_value] = {};
		}

		current_value = current_value[segment_value];
		segment_index += 1;
	}
}

function clone_value(value) {
	if(Array.isArray(value)) {
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
