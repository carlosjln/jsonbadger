/*
 * MODULE RESPONSIBILITY
 * Cast read-query operator values with schema-aware rules.
 */
import {is_function} from '#src/utils/value.js';

import {resolve_query_field_type} from '#src/sql/read/where/context.js';

function cast_query_value(path_value, comparison_value, compile_context) {
	if(comparison_value === undefined || comparison_value === null) {
		return comparison_value;
	}

	const field_type = resolve_query_field_type(compile_context, path_value);

	if(!field_type || !is_function(field_type.cast)) {
		return comparison_value;
	}

	return field_type.cast(comparison_value, {
		path: path_value,
		mode: 'query'
	});
}

function cast_array_contains_value(path_value, comparison_value, compile_context) {
	const field_type = resolve_query_field_type(compile_context, path_value);

	if(!field_type || field_type.instance !== 'Array' || !field_type.of_field_type || !is_function(field_type.of_field_type.cast)) {
		return comparison_value;
	}

	return field_type.of_field_type.cast(comparison_value, {
		path: path_value,
		mode: 'query'
	});
}

function cast_operator_value(path_value, operator_name, operator_value, compile_context) {
	if(
		operator_name === '$eq' ||
		operator_name === '$ne' ||
		operator_name === '$gt' ||
		operator_name === '$gte' ||
		operator_name === '$lt' ||
		operator_name === '$lte'
	) {
		return cast_query_value(path_value, operator_value, compile_context);
	}

	if(operator_name === '$in' || operator_name === '$nin') {
		if(!Array.isArray(operator_value)) {
			return [cast_query_value(path_value, operator_value, compile_context)];
		}

		const casted_values = [];
		let value_index = 0;

		while(value_index < operator_value.length) {
			casted_values.push(cast_query_value(path_value, operator_value[value_index], compile_context));
			value_index += 1;
		}

		return casted_values;
	}

	if(operator_name === '$all') {
		if(!Array.isArray(operator_value)) {
			return operator_value;
		}

		const casted_values = [];
		let value_index = 0;

		while(value_index < operator_value.length) {
			casted_values.push(cast_array_contains_value(path_value, operator_value[value_index], compile_context));
			value_index += 1;
		}

		return casted_values;
	}

	return operator_value;
}

export {
	cast_array_contains_value,
	cast_operator_value,
	cast_query_value
};
