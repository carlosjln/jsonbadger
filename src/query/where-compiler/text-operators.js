import QueryError from '#src/errors/query-error.js';

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
} from '#src/query/operators/index.js';

function compile_text_operator(
	name,
	value,
	casted_value,
	regex_options,
	text_expression,
	parameter_state,
	error_message
) {
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

	if(
		name === '$contains' ||
		name === '$has_key' ||
		name === '$has_any_keys' ||
		name === '$has_all_keys' ||
		name === '$json_path_exists' ||
		name === '$json_path_match' ||
		name === '$all' ||
		name === '$size'
	) {
		return null;
	}

	throw new QueryError(error_message + ': ' + name, {
		operator: name
	});
}

function compile_scalar_operator(name, value, regex_options, elem_expression, parameter_state) {
	const predicate = compile_text_operator(
		name,
		value,
		value,
		regex_options,
		elem_expression,
		parameter_state,
		'Unsupported operator inside $elem_match'
	);

	if(predicate !== null) {
		return predicate;
	}

	throw new QueryError('Unsupported operator inside $elem_match: ' + name, {
		operator: name
	});
}

export {
	compile_scalar_operator,
	compile_text_operator
};
