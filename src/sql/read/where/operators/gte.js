/*
 * MODULE RESPONSIBILITY
 * Compile the SQL fragment for the $gte read-query operator.
 */
import QueryError from '#src/errors/query-error.js';
import {bind_parameter} from '#src/sql/parameter-binder.js';
import {is_nan} from '#src/utils/value.js';

function gte_operator(sql_expression, comparison_value, parameter_state) {
	if(is_nan(comparison_value)) {
		throw new QueryError('Invalid value for $gte operator', {
			operator: '$gte',
			value: comparison_value
		});
	}

	const numeric_value = typeof comparison_value === 'bigint' ? comparison_value.toString() : Number(comparison_value);
	const placeholder = bind_parameter(parameter_state, numeric_value);

	return '(' + sql_expression + ')::numeric >= ' + placeholder;
}

export default gte_operator;
