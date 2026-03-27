/*
 * MODULE RESPONSIBILITY
 * Compile the SQL fragment for the $has-key read-query operator.
 */
import {bind_parameter} from '#src/sql/parameter-binder.js';

function has_key_operator(jsonb_expression, comparison_value, parameter_state) {
	const placeholder = bind_parameter(parameter_state, String(comparison_value));
	return jsonb_expression + ' ? ' + placeholder;
}

export default has_key_operator;
