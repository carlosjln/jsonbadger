import QueryError from '#src/errors/query-error.js';
import {bind_parameter} from '#src/sql/parameter-binder.js';
import {is_string} from '#src/utils/value.js';

export default function jsonpath_exists_operator(jsonb_expression, comparison_value, parameter_state) {
	if(!is_string(comparison_value) || comparison_value.trim() === '') {
		throw new QueryError('Invalid value for $json_path_exists operator', {
			operator: '$json_path_exists',
			value: comparison_value
		});
	}

	const placeholder = bind_parameter(parameter_state, comparison_value);
	return jsonb_expression + ' @? ' + placeholder + '::jsonpath';
}
