import {bind_parameter} from '#src/sql/parameter-binder.js';
import {jsonb_stringify} from '#src/utils/json.js';

export default function contains_operator(jsonb_expression, comparison_value, parameter_state) {
	const placeholder = bind_parameter(parameter_state, jsonb_stringify(comparison_value));
	return jsonb_expression + ' @> ' + placeholder + '::jsonb';
}
