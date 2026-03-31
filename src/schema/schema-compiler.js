import field_definition_parser from '#src/schema/field-definition-parser.js';
import {create_path_introspection} from '#src/schema/path-introspection.js';

import {is_array} from '#src/utils/array.js';
import {has_own} from '#src/utils/object.js';
import {is_function, is_not_object} from '#src/utils/value.js';

const schema_validation_error_message = 'Schema validation failed';
const schema_validation_error_code = 'validation_error';

// --- PUBLIC API ---

function prepare_schema_state(schema_definition = {}) {
	const parsed_schema = field_definition_parser(schema_definition);
	const path_introspection = create_path_introspection(parsed_schema);
	const field_types = path_introspection.field_types;
	const sorted_paths = Object.keys(field_types).sort(sort_paths_by_depth);

	return {
		path_introspection,
		field_types,
		sorted_paths
	};
}

/**
 * Build one reusable validator from a prepared field-type path map.
 *
 * @param {object} field_types
 * @returns {Function}
 */
function create_path_validator(field_types = {}) {
	const sorted_paths = Object.keys(field_types).sort(sort_paths_by_depth);

	return (payload) => {
		return validate_payload(payload, sorted_paths, field_types);
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

	for(const path_name of sorted_paths) {
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

// --- LOCAL HELPER FUNCTIONS ---

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

	for(const segment_value of path_segments) {
		if(current_value === null || typeof current_value !== 'object' || !has_own(current_value, segment_value)) {
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

export {
	create_path_validator,
	prepare_schema_state,
	validate_payload,
	sort_paths_by_depth
};
