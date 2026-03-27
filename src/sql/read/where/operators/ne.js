/*
 * MODULE RESPONSIBILITY
 * Compile the SQL fragment for the $ne read-query operator.
 */
import {bind_parameter} from '#src/sql/parameter-binder.js';

function ne_operator(sql_expression, comparison_value, parameter_state) {
	const placeholder = bind_parameter(parameter_state, String(comparison_value));
	return sql_expression + ' != ' + placeholder;
}

export default ne_operator;
