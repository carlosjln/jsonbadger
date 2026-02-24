import {bind_parameter} from '#src/sql/parameter-binder.js';

export default function regex_operator(sql_expression, pattern_value, option_value, parameter_state) {
	const regex_operator_value = option_value && option_value.indexOf('i') >= 0 ? '~*' : '~';
	const placeholder = bind_parameter(parameter_state, String(pattern_value));

	return sql_expression + ' ' + regex_operator_value + ' ' + placeholder;
}
