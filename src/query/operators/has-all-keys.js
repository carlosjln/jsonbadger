import {bind_parameter} from '#src/sql/parameter-binder.js';
import {to_array} from '#src/utils/array.js';

export default function has_all_keys_operator(jsonb_expression, comparison_value, parameter_state) {
	const key_list = to_array(comparison_value).map(function map_key(key_value) {
		return String(key_value);
	});

	const placeholder = bind_parameter(parameter_state, key_list);
	return jsonb_expression + ' ?& ' + placeholder + '::text[]';
}
