import QueryError from '#src/errors/query-error.js';
import {bind_parameter} from '#src/sql/parameter-binder.js';
import {is_nan} from '#src/utils/value.js';

export default function size_operator(jsonb_expression, comparison_value, parameter_state) {
	if(is_nan(comparison_value)) {
		throw new QueryError('Invalid value for $size operator', {
			operator: '$size',
			value: comparison_value
		});
	}

	const numeric_value = Number(comparison_value);
	const placeholder = bind_parameter(parameter_state, numeric_value);
	return 'jsonb_array_length(' + jsonb_expression + ') = ' + placeholder;
}
