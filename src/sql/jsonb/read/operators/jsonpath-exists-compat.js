/*
 * MODULE RESPONSIBILITY
 * Compile the SQL fragment for the compatibility $json_path_exists read-query operator.
 */
import QueryError from '#src/errors/query-error.js';
import {bind_parameter} from '#src/sql/parameter-binder.js';
import {is_string} from '#src/utils/value.js';

function jsonpath_exists_compat_operator(jsonb_expression, comparison_value, parameter_state) {
	if(!is_string(comparison_value) || comparison_value.trim() === '') {
		throw new QueryError('Invalid value for $json_path_exists operator', {
			operator: '$json_path_exists',
			value: comparison_value
		});
	}

	const placeholder = bind_parameter(parameter_state, comparison_value);

	return jsonb_expression + ' @? ' + placeholder + '::jsonpath';
}

export default jsonpath_exists_compat_operator;
