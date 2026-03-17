import {assert_path} from '#src/utils/assert.js';

function split_dot_path(path_value) {
	assert_path(path_value, 'path');
	const segments = path_value.split('.');

	let segment_index = 0;

	while(segment_index < segments.length) {
		const segment = segments[segment_index];

		// Prevent Prototype Pollution by strictly blocking internal object keys
		if(segment === '__proto__' || segment === 'constructor' || segment === 'prototype') {
			throw new Error('Invalid path: restricted key name "' + segment + '"');
		}

		segment_index += 1;
	}

	return segments;
}

function build_path_literal(path_segments) {
	const escaped_segments = [];
	let segment_index = 0;

	// PostgreSQL text array literals require items to be safely quoted 
	// if they contain spaces, commas, or special characters. 
	// The safest approach is to double-quote all elements and escape internal quotes/backslashes.
	while(segment_index < path_segments.length) {
		const segment = String(path_segments[segment_index]);

		// Escape backslashes and double quotes with a backslash, then wrap in double quotes
		const escaped_segment = '"' + segment.replace(/(["\\])/g, '\\$1') + '"';
		escaped_segments.push(escaped_segment);

		segment_index += 1;
	}

	return '{' + escaped_segments.join(',') + '}';
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