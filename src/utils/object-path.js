import {assert_path} from '#src/utils/assert.js';

function split_dot_path(path_value) {
	assert_path(path_value, 'path');
	return path_value.split('.');
}

function build_path_literal(path_segments) {
	return '{' + path_segments.join(',') + '}';
}

function build_nested_object(path_value, leaf_value) {
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

export {
	split_dot_path,
	build_path_literal,
	build_nested_object
};
