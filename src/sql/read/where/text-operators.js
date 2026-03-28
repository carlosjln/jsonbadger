/*
 * MODULE RESPONSIBILITY
 * Compile scalar and text read-query operators into SQL predicates.
 */
import {
	eq_operator,
	gt_operator,
	gte_operator,
	in_operator,
	lt_operator,
	lte_operator,
	ne_operator,
	nin_operator,
	regex_operator
} from '#src/sql/read/where/operators/index.js';

/**
 * Compile one scalar comparison operator into a SQL predicate.
 *
 * @param {object} operator_context
 * @param {string} operator_context.name
 * @param {*} operator_context.value
 * @param {*} [operator_context.casted_value]
 * @param {*} operator_context.regex_options
 * @param {string} operator_context.text_expression
 * @param {object} operator_context.parameter_state
 * @param {string} operator_context.error_message
 * @returns {string|null}
 * @throws {QueryError}
 */
function compile_text_operator(operator_context) {
	const {
		name,
		value,
		casted_value = value,
		regex_options,
		text_expression,
		parameter_state,
		error_message
	} = operator_context;

	if(name === '$eq') {
		return eq_operator(text_expression, casted_value, parameter_state);
	}

	if(name === '$ne') {
		return ne_operator(text_expression, casted_value, parameter_state);
	}

	if(name === '$gt') {
		return gt_operator(text_expression, casted_value, parameter_state);
	}

	if(name === '$gte') {
		return gte_operator(text_expression, casted_value, parameter_state);
	}

	if(name === '$lt') {
		return lt_operator(text_expression, casted_value, parameter_state);
	}

	if(name === '$lte') {
		return lte_operator(text_expression, casted_value, parameter_state);
	}

	if(name === '$in') {
		return in_operator(text_expression, casted_value, parameter_state);
	}

	if(name === '$nin') {
		return nin_operator(text_expression, casted_value, parameter_state);
	}

	if(name === '$regex') {
		return regex_operator(text_expression, value, regex_options, parameter_state);
	}

	return null;
}

export {
	compile_text_operator
};
