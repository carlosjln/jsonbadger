/*
 * MODULE RESPONSIBILITY
 * Compile nested array and $elem_match predicates for read queries.
 */
import {build_elem_text_expression, build_json_expression} from '#src/sql/read/path-parser.js';
import {elem_match_operator, eq_operator, regex_operator} from '#src/sql/read/where/operators/index.js';

import {has_operator_entries} from '#src/sql/read/where/context.js';
import {compile_operator_entry_clauses} from '#src/sql/read/where/operator-entries.js';
import {compile_text_operator} from '#src/sql/read/where/text-operators.js';

import {split_dot_path} from '#src/utils/object-path.js';
import {is_object} from '#src/utils/value.js';

const unsupported_elem_match_operator_message = 'Unsupported operator inside $elem_match';

function compile_nested_array_operator(operator_name, operator_value, regex_options, path_info, data_column_reference, parameter_state) {
	const array_expression = build_json_expression(data_column_reference, path_info.root_path);
	const elem_expression = build_elem_text_expression('elem', path_info.child_segments);
	const predicate = compile_text_operator({
		name: operator_name,
		value: operator_value,
		regex_options,
		text_expression: elem_expression,
		parameter_state,
		error_message: unsupported_elem_match_operator_message
	});

	return elem_match_operator(array_expression, predicate);
}

function compile_elem_match_clause(path_value, elem_match_value, data_column_reference, parameter_state) {
	const array_expression = build_json_expression(data_column_reference, path_value);
	const predicate_list = [];

	if(elem_match_value instanceof RegExp) {
		predicate_list.push(regex_operator("elem #>> '{}'", elem_match_value.source, elem_match_value.flags, parameter_state));
		return elem_match_operator(array_expression, predicate_list.join(' AND '));
	}

	if(!is_object(elem_match_value)) {
		predicate_list.push(eq_operator("elem #>> '{}'", elem_match_value, parameter_state));
		return elem_match_operator(array_expression, predicate_list.join(' AND '));
	}

	if(has_operator_entries(elem_match_value)) {
		const option_value = elem_match_value.$options || '';
		const compile_operator_predicate = (operator_name, operator_value) => {
			return compile_text_operator({
				name: operator_name,
				value: operator_value,
				regex_options: option_value,
				text_expression: "elem #>> '{}'",
				parameter_state,
				error_message: unsupported_elem_match_operator_message
			});
		};
		const operator_predicates = compile_operator_entry_clauses(elem_match_value, compile_operator_predicate);
		predicate_list.push.apply(predicate_list, operator_predicates);

		return elem_match_operator(array_expression, predicate_list.join(' AND '));
	}

	const elem_entries = Object.entries(elem_match_value);
	let entry_index = 0;

	while(entry_index < elem_entries.length) {
		const entry_pair = elem_entries[entry_index];
		const nested_path = entry_pair[0];
		const nested_value = entry_pair[1];
		const nested_segments = split_dot_path(nested_path);
		const elem_expression = build_elem_text_expression('elem', nested_segments);

		if(nested_value instanceof RegExp) {
			predicate_list.push(regex_operator(elem_expression, nested_value.source, nested_value.flags, parameter_state));
			entry_index += 1;
			continue;
		}

		if(is_object(nested_value) && has_operator_entries(nested_value)) {
			const option_value = nested_value.$options || '';
			const compile_nested_predicate = (operator_name, operator_value) => {
				return compile_text_operator({
					name: operator_name,
					value: operator_value,
					regex_options: option_value,
					text_expression: elem_expression,
					parameter_state,
					error_message: unsupported_elem_match_operator_message
				});
			};
			const nested_predicates = compile_operator_entry_clauses(nested_value, compile_nested_predicate);
			predicate_list.push.apply(predicate_list, nested_predicates);

			entry_index += 1;
			continue;
		}

		predicate_list.push(eq_operator(elem_expression, nested_value, parameter_state));
		entry_index += 1;
	}

	return elem_match_operator(array_expression, predicate_list.join(' AND '));
}

export {
	compile_elem_match_clause,
	compile_nested_array_operator
};
