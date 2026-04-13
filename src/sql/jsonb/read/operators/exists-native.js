/*
 * MODULE RESPONSIBILITY
 * Compile the native JSONPath-backed SQL fragment for the $exists read-query operator.
 */
import QueryError from '#src/errors/query-error.js';
import {bind_parameter} from '#src/sql/parameter-binder.js';
import {split_dot_path} from '#src/utils/object-path.js';

function jsonpath_exists_native_operator(jsonb_expression, comparison_value, parameter_state, operator_context = {}) {
	const data_column_reference = operator_context.data_column_reference;
	const path_value = operator_context.path_value;

	if(comparison_value !== true && comparison_value !== false) {
		throw new QueryError('Invalid value for $exists operator', {
			operator: '$exists',
			value: comparison_value
		});
	}

	if(typeof data_column_reference !== 'string' || data_column_reference.length === 0) {
		throw new QueryError('Native $exists operator requires a JSONB column reference', {
			operator: '$exists',
			path: path_value
		});
	}

	const jsonpath_expression = '$.' + split_dot_path(path_value).join('.');
	const placeholder = bind_parameter(parameter_state, jsonpath_expression);
	const native_exists_clause = data_column_reference + ' @? ' + placeholder + '::jsonpath';

	if(comparison_value === true) {
		return native_exists_clause;
	}

	return 'NOT (' + native_exists_clause + ')';
}

export default jsonpath_exists_native_operator;
