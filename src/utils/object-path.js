import {assert_path} from '#src/utils/assert.js';

export function split_dot_path(path_value) {
	assert_path(path_value, 'path');
	return path_value.split('.');
}

export function build_path_literal(path_segments) {
	return '{' + path_segments.join(',') + '}';
}

export function build_nested_object(path_value, leaf_value) {
	const path_segments = split_dot_path(path_value);
	const root_object = {};
	let current_object = root_object;
	let path_index = 0;

	while(path_index < path_segments.length) {
		const path_segment = path_segments[path_index];
		const is_leaf = path_index === path_segments.length - 1;

		if(is_leaf) {
			current_object[path_segment] = leaf_value;
			break;
		}

		current_object[path_segment] = {};
		current_object = current_object[path_segment];
		path_index += 1;
	}

	return root_object;
}
