/*
 * MODULE RESPONSIBILITY
 * Create shared compile context helpers for read-query WHERE compilation.
 */
import ID_STRATEGY from '#src/constants/id-strategy.js';

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

function create_compile_context(compile_options) {
	const options = compile_options ?? {};
	const data_column_name = options.data_column ?? 'data';
	const data_column_reference = quote_identifier(data_column_name);
	const schema_instance = options.schema ?? null;
	const id_strategy = options.id_strategy === ID_STRATEGY.uuidv7 ? ID_STRATEGY.uuidv7 : ID_STRATEGY.bigserial;

	return {
		data_column_reference,
		schema_instance,
		id_strategy
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
