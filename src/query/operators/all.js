import {bind_parameter} from '#src/sql/parameter-binder.js';
import {jsonb_stringify} from '#src/utils/json.js';
import {to_array} from '#src/utils/array.js';

export default function all_operator(jsonb_expression, comparison_value, parameter_state) {
	const value_list = to_array(comparison_value);
	const placeholder = bind_parameter(parameter_state, jsonb_stringify(value_list));

	return jsonb_expression + ' @> ' + placeholder + '::jsonb';
}
