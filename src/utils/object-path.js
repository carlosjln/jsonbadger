import {assert_path} from '#src/utils/assert.js';
import {is_array} from '#src/utils/array.js';
import {has_own} from '#src/utils/object.js';
import {is_not_object, is_plain_object} from '#src/utils/value.js';

// --- PUBLIC API ---

/**
 * Encodes an array of path segments into a PostgreSQL text array literal {a,b,c}.
 *
 * @param {string[]} path_segments
 * @returns {string}
 */
function build_path_literal(path_segments) {
	const escaped_segments = [];

	for(const segment of path_segments) {
		// Escape backslashes and double quotes with a backslash, then wrap in double quotes
		escaped_segments.push('"' + String(segment).replace(/(["\\])/g, '\\$1') + '"');
	}

	return '{' + escaped_segments.join(',') + '}';
}

/**
 * Recursively builds a nested object structure from a dot-path and a leaf value.
 * Used for generating JSONB containment payloads.
 *
 * @param {string} path_value
 * @param {*} leaf_value
 * @returns {object}
 * @throws {Error} If the path contains restricted prototype keys.
 */
function build_nested_object(path_value, leaf_value) {
	const path_segments = split_dot_path(path_value);
	const root_object = {};
	let current_object = root_object;

	const depth = path_segments.length - 1;
	const leaf_segment = path_segments[depth];

	for(let i = 0; i < depth; i++) {
		const path_segment = path_segments[i];
		current_object[path_segment] = {};
		current_object = current_object[path_segment];
	}

	current_object[leaf_segment] = leaf_value;

	return root_object;
}

/**
 * Expands dotted object keys into nested object structures at the input boundary.
 *
 * @param {*} source_value
 * @returns {*}
 * @throws {Error} If any nested path contains restricted prototype keys.
 */
function expand_dot_paths(source_value) {
	if(is_array(source_value)) {
		const next_array = [];

		for(const item of source_value) {
			next_array.push(expand_dot_paths(item));
		}

		return next_array;
	}

	if(!is_plain_object(source_value)) {
		return source_value;
	}

	const expanded_object = {};

	for(const [path_name, next_value] of Object.entries(source_value)) {
		const expanded_value = expand_dot_paths(next_value);

		if(path_name.includes('.')) {
			assign_nested_value(expanded_object, split_dot_path(path_name), expanded_value);
		} else if(is_plain_object(expanded_value) && is_plain_object(expanded_object[path_name])) {
			expanded_object[path_name] = merge_plain_objects(expanded_object[path_name], expanded_value);
		} else {
			expanded_object[path_name] = expanded_value;
		}
	}

	return expanded_object;
}

/**
 * Normalizes a dot-path by collapsing multiple consecutive dots and splitting into segments.
 *
 * @param {string} path_value
 * @returns {string[]}
 * @throws {Error} If the path contains restricted prototype keys.
 */
function split_dot_path(path_value) {
	// Clean state: collapse multiple dots into one to prevent empty segment errors.
	const clean_path = String(path_value).replace(/\.+/g, '.');

	assert_path(clean_path, 'path');
	const segments = clean_path.split('.');

	for(const segment of segments) {
		// Prevent Prototype Pollution by strictly blocking internal object keys
		if(segment === '__proto__' || segment === 'constructor' || segment === 'prototype') {
			throw new Error('Invalid path: restricted key name "' + segment + '"');
		}
	}

	return segments;
}

/**
 * Reads one nested value from an object path.
 *
 * @param {object} root_object
 * @param {string[]} path_segments
 * @returns {{exists: boolean, value: *}}
 */
function read_nested_path(root_object, path_segments) {
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

/**
 * Writes one normalized value into a nested object path.
 *
 * @param {object} root_object
 * @param {string[]} path_segments
 * @param {*} next_value
 * @returns {void}
 */
function write_nested_path(root_object, path_segments, next_value) {
	let current_object = root_object;
	const depth = path_segments.length - 1;

	for(let i = 0; i < depth; i++) {
		const path_segment = path_segments[i];

		if(is_not_object(current_object[path_segment])) {
			current_object[path_segment] = {};
		}

		current_object = current_object[path_segment];
	}

	current_object[path_segments[depth]] = next_value;
}

// --- LOCAL HELPERS ---

/**
 * Writes one normalized value into a nested object path.
 *
 * @param {object} root_object
 * @param {string[]} path_segments
 * @param {*} next_value
 * @returns {void}
 */
function assign_nested_value(root_object, path_segments, next_value) {
	let current_object = root_object;
	const depth = path_segments.length - 1;
	const leaf_segment = path_segments[depth];

	for(let i = 0; i < depth; i++) {
		const path_segment = path_segments[i];
		if(!is_plain_object(current_object[path_segment])) {
			current_object[path_segment] = {};
		}

		current_object = current_object[path_segment];
	}

	if(is_plain_object(next_value) && is_plain_object(current_object[leaf_segment])) {
		current_object[leaf_segment] = merge_plain_objects(current_object[leaf_segment], next_value);
	} else {
		current_object[leaf_segment] = next_value;
	}
}

/**
 * Deep-merges plain objects while letting later values win on scalar collisions.
 *
 * @param {object} base_object
 * @param {object} patch_object
 * @returns {object}
 */
function merge_plain_objects(base_object, patch_object) {
	const merged_object = {...base_object};

	for(const [key, value] of Object.entries(patch_object)) {
		if(is_plain_object(value) && is_plain_object(merged_object[key])) {
			merged_object[key] = merge_plain_objects(merged_object[key], value);
		} else {
			merged_object[key] = value;
		}
	}

	return merged_object;
}

export {
	split_dot_path,
	read_nested_path,
	write_nested_path,
	build_path_literal,
	build_nested_object,
	expand_dot_paths
};
