/*
 * MODULE RESPONSIBILITY
 * Compile operator-style read-query objects into SQL predicates.
 */
import {
	all_operator
} from '#src/sql/read/where/operators/index.js';
import contains_operator from '#src/sql/jsonb/read/operators/contains.js';
import has_all_keys_operator from '#src/sql/jsonb/read/operators/has-all-keys.js';
import has_any_keys_operator from '#src/sql/jsonb/read/operators/has-any-keys.js';
import has_key_operator from '#src/sql/jsonb/read/operators/has-key.js';
import size_operator from '#src/sql/jsonb/read/operators/size.js';
import {build_json_expression, build_text_expression, parse_path} from '#src/sql/jsonb/path-parser.js';

import QueryError from '#src/errors/query-error.js';

import {cast_operator_value} from '#src/sql/read/where/casting.js';
import {is_array_root} from '#src/sql/read/where/context.js';
import {compile_nested_array_operator} from '#src/sql/jsonb/read/elem-match.js';
import {compile_operator_entry_clauses} from '#src/sql/read/where/operator-entries.js';
import {compile_text_operator} from '#src/sql/read/where/text-operators.js';

import {build_nested_object} from '#src/utils/object-path.js';

function compile_operator_object(path_value, operator_definition, compile_context, parameter_state) {
	const path_info = parse_path(path_value);
	const regex_options = operator_definition.$options || '';
	const has_array_path = is_array_root(compile_context, path_info.root_path) && path_info.child_segments.length > 0;

	const clause_list = compile_operator_entry_clauses(operator_definition, function (operator_name, operator_value) {
		if(has_array_path) {
			return compile_nested_array_operator(
				operator_name,
				operator_value,
				regex_options,
				path_info,
				compile_context.data_column_reference,
				parameter_state
			);
		}

		return compile_standard_operator({
			name: operator_name,
			value: operator_value,
			regex_options,
			path_value,
			compile_context,
			parameter_state
		});
	});

	return clause_list.join(' AND ');
}

function compile_standard_operator(context) {
	const {
		name,
		value,
		regex_options,
		path_value,
		compile_context,
		parameter_state
	} = context;

	const data_column_reference = compile_context.data_column_reference;
	const text_expression = build_text_expression(data_column_reference, path_value);
	const jsonb_expression = build_json_expression(data_column_reference, path_value);
	const casted_value = cast_operator_value(path_value, name, value, compile_context);
	const text_operator_clause = compile_text_operator({
		name,
		value,
		casted_value,
		regex_options,
		text_expression,
		parameter_state,
		error_message: 'Unsupported operator'
	});

	if(text_operator_clause) {
		return text_operator_clause;
	}

	if(name === '$contains') {
		const nested_object = build_nested_object(path_value, value);
		return contains_operator(data_column_reference, nested_object, parameter_state);
	}

	if(name === '$has_key') {
		return has_key_operator(jsonb_expression, value, parameter_state);
	}

	if(name === '$has_any_keys') {
		return has_any_keys_operator(jsonb_expression, value, parameter_state);
	}

	if(name === '$has_all_keys') {
		return has_all_keys_operator(jsonb_expression, value, parameter_state);
	}

	if(name === '$exists') {
		const bound_read_operator = resolve_read_operator(compile_context, name, path_value);
		return bound_read_operator(jsonb_expression, value, parameter_state, {
			data_column_reference,
			path_value
		});
	}

	if(name === '$all') {
		return all_operator(jsonb_expression, casted_value, parameter_state);
	}

	if(name === '$size') {
		return size_operator(jsonb_expression, value, parameter_state);
	}

	throw new QueryError('Unsupported operator: ' + name, {
		operator: name,
		path: path_value
	});
}

/**
 * Resolve one already-bound read operator from the schema runtime.
 *
 * @param {object} compile_context
 * @param {string} operator_name
 * @param {string} path_value
 * @returns {Function}
 * @throws {QueryError}
 */
function resolve_read_operator(compile_context, operator_name, path_value) {
	const schema_instance = compile_context.schema_instance;
	const bound_read_operator = schema_instance?.$runtime?.read_operators?.[operator_name];

	if(bound_read_operator) {
		return bound_read_operator;
	}

	throw new QueryError('Read operator requires a bound schema runtime: ' + operator_name, {
		operator: operator_name,
		path: path_value
	});
}

export {
	compile_operator_object
};
