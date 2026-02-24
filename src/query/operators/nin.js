import {bind_parameter} from '#src/sql/parameter-binder.js';
import {to_array} from '#src/utils/array.js';

export default function nin_operator(sql_expression, comparison_value, parameter_state) {
	const value_list = to_array(comparison_value);
	const normalized_values = value_list.map(function map_value(current_value) {
		return String(current_value);
	});
	const placeholder = bind_parameter(parameter_state, normalized_values);

	return 'NOT (' + sql_expression + ' = ANY(' + placeholder + '::text[]))';
}
