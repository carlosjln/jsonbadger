import {bind_parameter} from '#src/sql/parameter-binder.js';

export default function ne_operator(sql_expression, comparison_value, parameter_state) {
	const placeholder = bind_parameter(parameter_state, String(comparison_value));
	return sql_expression + ' != ' + placeholder;
}
