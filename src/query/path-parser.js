import {assert_path} from '#src/utils/assert.js';
import {build_path_literal, split_dot_path} from '#src/utils/object-path.js';

export function build_text_expression(column_reference, path_value) {
	const path_segments = split_dot_path(path_value);

	if(path_segments.length === 1) {
		return column_reference + " ->> '" + path_segments[0] + "'";
	}

	return column_reference + " #>> '" + build_path_literal(path_segments) + "'";
}

export function build_json_expression(column_reference, path_value) {
	const path_segments = split_dot_path(path_value);

	if(path_segments.length === 1) {
		return column_reference + " -> '" + path_segments[0] + "'";
	}

	return column_reference + " #> '" + build_path_literal(path_segments) + "'";
}

export function build_elem_text_expression(elem_alias, path_segments) {
	if(path_segments.length === 1) {
		return elem_alias + "->>'" + path_segments[0] + "'";
	}

	return elem_alias + " #>> '" + build_path_literal(path_segments) + "'";
}

export function parse_path(path_value) {
	assert_path(path_value, 'path');

	const path_segments = split_dot_path(path_value);

	return {
		path_segments: path_segments,
		root_path: path_segments[0],
		child_segments: path_segments.slice(1),
		is_nested: path_segments.length > 1
	};
}
