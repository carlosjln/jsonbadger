/*
 * MODULE RESPONSIBILITY
 * Compile one read-query field clause into SQL.
 */
import {build_text_expression} from '#src/sql/read/path-parser.js';
import {contains_operator, eq_operator, regex_operator} from '#src/sql/read/where/operators/index.js';
import {compile_base_field_clause, resolve_base_field_name} from '#src/sql/read/where/base-fields.js';

import {cast_array_contains_value, cast_query_value} from '#src/sql/read/where/casting.js';
import {has_operator_entries, should_use_array_contains} from '#src/sql/read/where/context.js';
import {compile_elem_match_clause} from '#src/sql/read/where/elem-match.js';
import {compile_operator_object} from '#src/sql/read/where/operators.js';

import {build_nested_object} from '#src/utils/object-path.js';
import {is_object} from '#src/utils/value.js';

function compile_field_clause(path_value, comparison_value, compile_context, parameter_state) {
	const data_column_reference = compile_context.data_column_reference;
	const is_array_path = should_use_array_contains(path_value, comparison_value, compile_context);
	const base_field_name = resolve_base_field_name(path_value);

	if(base_field_name) {
		return compile_base_field_clause(base_field_name, comparison_value, compile_context, parameter_state);
	}

	if(comparison_value instanceof RegExp) {
		const text_expression = build_text_expression(data_column_reference, path_value);
		return regex_operator(text_expression, comparison_value.source, comparison_value.flags, parameter_state);
	}

	if(is_object(comparison_value)) {
		if(comparison_value.$elem_match !== undefined) {
			return compile_elem_match_clause(path_value, comparison_value.$elem_match, data_column_reference, parameter_state);
		}

		if(has_operator_entries(comparison_value)) {
			return compile_operator_object(path_value, comparison_value, compile_context, parameter_state);
		}

		const nested_object = build_nested_object(path_value, comparison_value);
		return contains_operator(data_column_reference, nested_object, parameter_state);
	}

	if(is_array_path) {
		const casted_array_value = cast_array_contains_value(path_value, comparison_value, compile_context);
		const nested_object = build_nested_object(path_value, [casted_array_value]);
		return contains_operator(data_column_reference, nested_object, parameter_state);
	}

	const text_expression = build_text_expression(data_column_reference, path_value);
	const casted_comparison_value = cast_query_value(path_value, comparison_value, compile_context);
	return eq_operator(text_expression, casted_comparison_value, parameter_state);
}

export {
	compile_field_clause
};
