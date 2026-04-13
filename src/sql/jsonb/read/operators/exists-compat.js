/*
 * MODULE RESPONSIBILITY
 * Compile the compatibility SQL fragment for the $exists read-query operator.
 */
import QueryError from '#src/errors/query-error.js';

function jsonpath_exists_compat_operator(jsonb_expression, comparison_value) {
	if(comparison_value !== true && comparison_value !== false) {
		throw new QueryError('Invalid value for $exists operator', {
			operator: '$exists',
			value: comparison_value
		});
	}

	if(comparison_value === true) {
		return '(' + jsonb_expression + ') IS NOT NULL';
	}

	return '(' + jsonb_expression + ') IS NULL';
}

export default jsonpath_exists_compat_operator;
