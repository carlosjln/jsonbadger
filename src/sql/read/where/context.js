/*
 * MODULE RESPONSIBILITY
 * Create shared compile context helpers for read-query WHERE compilation.
 */
import defaults from '#src/constants/defaults.js';

import {quote_identifier} from '#src/utils/assert.js';
import {is_function, is_object} from '#src/utils/value.js';

function resolve_query_field_type(compile_context, path_value) {
	const schema_instance = compile_context.schema_instance;

	if(!schema_instance || !is_function(schema_instance.get_path)) {
		return null;
	}

	return schema_instance.get_path(path_value);
}

function should_use_array_contains(path_value, comparison_value, compile_context) {
	const schema_instance = compile_context.schema_instance;

	if(!schema_instance || !is_function(schema_instance.is_array_root)) {
		return false;
	}

	if(is_object(comparison_value) || comparison_value instanceof RegExp) {
		return false;
	}

	return schema_instance.is_array_root(path_value);
}

function is_array_root(compile_context, root_path) {
	const schema_instance = compile_context.schema_instance;

	if(!schema_instance || !is_function(schema_instance.is_array_root)) {
		return false;
	}

	return schema_instance.is_array_root(root_path);
}

/**
 * Resolve the identity shape that should drive query id casting.
 *
 * @param {object|null|undefined} schema_instance
 * @returns {{type: string, format: string|null}}
 */
function resolve_query_identity(schema_instance) {
	const runtime_identity = schema_instance?.$runtime?.identity;

	if(runtime_identity) {
		return {
			type: runtime_identity.type,
			format: runtime_identity.format
		};
	}

	const configured_identity = schema_instance?.options?.identity;

	if(configured_identity) {
		return {
			type: configured_identity.type,
			format: configured_identity.format
		};
	}

	return {
		type: defaults.schema_options.identity.type,
		format: defaults.schema_options.identity.format
	};
}

/**
 * Create the normalized compile context for one where-compiler execution.
 *
 * @param {object|null|undefined} compile_options
 * @returns {object}
 */
function create_compile_context(compile_options) {
	const options = compile_options ?? {};
	const data_column_name = options.data_column ?? 'data';
	const data_column_reference = quote_identifier(data_column_name);
	const schema_instance = options.schema ?? null;
	const query_identity = resolve_query_identity(schema_instance);

	return {
		data_column_reference,
		schema_instance,
		identity_type: query_identity.type,
		identity_format: query_identity.format
	};
}

function has_operator_entries(object_value) {
	const keys = Object.keys(object_value);
	let key_index = 0;

	while(key_index < keys.length) {
		if(keys[key_index][0] === '$') {
			return true;
		}

		key_index += 1;
	}

	return false;
}

export {
	create_compile_context,
	has_operator_entries,
	is_array_root,
	resolve_query_field_type,
	should_use_array_contains
};
