import {
	all_operator,
	contains_operator,
	elem_match_operator,
	eq_operator,
	gt_operator,
	gte_operator,
	has_all_keys_operator,
	has_any_keys_operator,
	has_key_operator,
	in_operator,
	jsonpath_exists_operator,
	jsonpath_match_operator,
	lt_operator,
	lte_operator,
	ne_operator,
	nin_operator,
	regex_operator,
	size_operator
} from '#src/query/operators/index.js';

import {build_elem_text_expression, build_json_expression, build_text_expression, parse_path} from '#src/query/path-parser.js';
import {compile_base_field_clause, resolve_base_field_name} from '#src/query/where-base-fields.js';

import QueryError from '#src/errors/query-error.js';
import {create_parameter_state} from '#src/sql/parameter-binder.js';
import IdStrategies from '#src/constants/id-strategies.js';

import {quote_identifier} from '#src/utils/assert.js';
import {build_nested_object, split_dot_path} from '#src/utils/object-path.js';
import {is_function, is_object} from '#src/utils/value.js';

// TODO: might as well split into multiple files within the same directory

function where_compiler(query_filter, compile_options, start_index) {
	const filter_object = query_filter ?? {};
	const compile_context = create_compile_context(compile_options);
	const parameter_state = create_parameter_state(start_index);
	const clause_list = [];
	const filter_entries = Object.entries(filter_object);
	let entry_index = 0;

	while(entry_index < filter_entries.length) {
		const entry_pair = filter_entries[entry_index];
		const path_value = entry_pair[0];
		const comparison_value = entry_pair[1];
		const clause = compile_field_clause(path_value, comparison_value, compile_context, parameter_state);

		if(clause) {
			clause_list.push(clause);
		}

		entry_index += 1;
	}

	return {
		sql: clause_list.length > 0 ? clause_list.join(' AND ') : 'TRUE',
		params: parameter_state.params,
		next_index: parameter_state.current_index
	};
}

function compile_field_clause(path_value, comparison_value, compile_context, parameter_state) {
	const data_column_reference = compile_context.data_column_reference;
	const is_array_path = should_use_array_contains(path_value, comparison_value, compile_context);
	const base_field_name = resolve_base_field_name(path_value);

	if(base_field_name) {
		return compile_base_field_clause(base_field_name, comparison_value, compile_context, parameter_state);
	}

	if(comparison_value instanceof RegExp) {
		const text_expression = build_text_expression(data_column_reference, path_value);
		return regex_operator(text_expression, comparison_value.source, comparison_value.flags, parameter_state);
	}

	if(is_object(comparison_value)) {
		if(comparison_value.$elem_match !== undefined) {
			return compile_elem_match_clause(path_value, comparison_value.$elem_match, data_column_reference, parameter_state);
		}

		if(has_operator_entries(comparison_value)) {
			return compile_operator_object(path_value, comparison_value, compile_context, parameter_state);
		}

		const nested_object = build_nested_object(path_value, comparison_value);
		return contains_operator(data_column_reference, nested_object, parameter_state);
	}

	if(is_array_path) {
		const casted_array_value = cast_array_contains_value(path_value, comparison_value, compile_context);
		const nested_object = build_nested_object(path_value, [casted_array_value]);
		return contains_operator(data_column_reference, nested_object, parameter_state);
	}

	const text_expression = build_text_expression(data_column_reference, path_value);
	const casted_comparison_value = cast_query_value(path_value, comparison_value, compile_context);
	return eq_operator(text_expression, casted_comparison_value, parameter_state);
}

// Operator-object compilation

function compile_operator_object(path_value, operator_definition, compile_context, parameter_state) {
	const path_info = parse_path(path_value);
	const regex_options = operator_definition.$options || '';
	const has_array_root = is_array_root(compile_context, path_info.root_path) && path_info.child_segments.length > 0;

	const clause_list = compile_operator_entry_clauses(operator_definition, function (operator_name, operator_value) {
		if(has_array_root) {
			return compile_nested_array_operator(
				operator_name,
				operator_value,
				regex_options,
				path_info,
				compile_context.data_column_reference,
				parameter_state
			);
		}

		return compile_standard_operator(
			operator_name,
			operator_value,
			regex_options,
			path_value,
			compile_context,
			parameter_state
		);
	});

	return clause_list.join(' AND ');
}

function compile_operator_entry_clauses(operator_definition, compile_operator_clause) {
	const clause_list = [];
	const operator_entries = Object.entries(operator_definition);
	let entry_index = 0;

	while(entry_index < operator_entries.length) {
		const operator_entry = operator_entries[entry_index];
		const operator_name = operator_entry[0];
		const operator_value = operator_entry[1];

		if(operator_name === '$options') {
			entry_index += 1;
			continue;
		}

		clause_list.push(
			compile_operator_clause(operator_name, operator_value)
		);
		entry_index += 1;
	}

	return clause_list;
}

// Path operator dispatch

function compile_standard_operator(operator_name, operator_value, regex_options, path_value, compile_context, parameter_state) {
	const data_column_reference = compile_context.data_column_reference;
	const text_expression = build_text_expression(data_column_reference, path_value);
	const json_expression = build_json_expression(data_column_reference, path_value);
	const casted_operator_value = cast_operator_value(path_value, operator_name, operator_value, compile_context);
	const text_operator_clause = compile_text_operator(
		operator_name,
		operator_value,
		casted_operator_value,
		regex_options,
		text_expression,
		parameter_state,
		'Unsupported operator'
	);

	if(text_operator_clause) {
		return text_operator_clause;
	}

	if(operator_name === '$contains') {
		const nested_object = build_nested_object(path_value, operator_value);
		return contains_operator(data_column_reference, nested_object, parameter_state);
	}

	if(operator_name === '$has_key') {
		return has_key_operator(json_expression, operator_value, parameter_state);
	}

	if(operator_name === '$has_any_keys') {
		return has_any_keys_operator(json_expression, operator_value, parameter_state);
	}

	if(operator_name === '$has_all_keys') {
		return has_all_keys_operator(json_expression, operator_value, parameter_state);
	}

	if(operator_name === '$json_path_exists') {
		return jsonpath_exists_operator(json_expression, operator_value, parameter_state);
	}

	if(operator_name === '$json_path_match') {
		return jsonpath_match_operator(json_expression, operator_value, parameter_state);
	}

	if(operator_name === '$all') {
		return all_operator(json_expression, casted_operator_value, parameter_state);
	}

	if(operator_name === '$size') {
		return size_operator(json_expression, operator_value, parameter_state);
	}

	throw new QueryError('Unsupported operator: ' + operator_name, {
		operator: operator_name,
		path: path_value
	});
}

// $elem_match compilation

function compile_nested_array_operator(operator_name, operator_value, regex_options, path_info, data_column_reference, parameter_state) {
	const array_expression = build_json_expression(data_column_reference, path_info.root_path);
	const elem_expression = build_elem_text_expression('elem', path_info.child_segments);
	const predicate = compile_scalar_operator(operator_name, operator_value, regex_options, elem_expression, parameter_state);

	return elem_match_operator(array_expression, predicate);
}

function compile_elem_match_clause(path_value, elem_match_value, data_column_reference, parameter_state) {
	const array_expression = build_json_expression(data_column_reference, path_value);
	const predicate_list = [];

	if(elem_match_value instanceof RegExp) {
		predicate_list.push(regex_operator("elem #>> '{}'", elem_match_value.source, elem_match_value.flags, parameter_state));
		return elem_match_operator(array_expression, predicate_list.join(' AND '));
	}

	if(!is_object(elem_match_value)) {
		predicate_list.push(eq_operator("elem #>> '{}'", elem_match_value, parameter_state));
		return elem_match_operator(array_expression, predicate_list.join(' AND '));
	}

	if(has_operator_entries(elem_match_value)) {
		const option_value = elem_match_value.$options || '';
		const operator_predicates = compile_operator_entry_clauses(elem_match_value, function (operator_name, operator_value) {
			return compile_scalar_operator(operator_name, operator_value, option_value, "elem #>> '{}'", parameter_state);
		});
		predicate_list.push.apply(predicate_list, operator_predicates);

		return elem_match_operator(array_expression, predicate_list.join(' AND '));
	}

	const elem_entries = Object.entries(elem_match_value);
	let entry_index = 0;

	while(entry_index < elem_entries.length) {
		const entry_pair = elem_entries[entry_index];
		const nested_path = entry_pair[0];
		const nested_value = entry_pair[1];
		const nested_segments = split_dot_path(nested_path);
		const elem_expression = build_elem_text_expression('elem', nested_segments);

		if(nested_value instanceof RegExp) {
			predicate_list.push(regex_operator(elem_expression, nested_value.source, nested_value.flags, parameter_state));
			entry_index += 1;
			continue;
		}

		if(is_object(nested_value) && has_operator_entries(nested_value)) {
			const option_value = nested_value.$options || '';
			const nested_predicates = compile_operator_entry_clauses(nested_value, function (operator_name, operator_value) {
				return compile_scalar_operator(operator_name, operator_value, option_value, elem_expression, parameter_state);
			});
			predicate_list.push.apply(predicate_list, nested_predicates);

			entry_index += 1;
			continue;
		}

		predicate_list.push(eq_operator(elem_expression, nested_value, parameter_state));
		entry_index += 1;
	}

	return elem_match_operator(array_expression, predicate_list.join(' AND '));
}

function compile_scalar_operator(operator_name, operator_value, regex_options, elem_expression, parameter_state) {
	const predicate = compile_text_operator(
		operator_name,
		operator_value,
		operator_value,
		regex_options,
		elem_expression,
		parameter_state,
		'Unsupported operator inside $elem_match'
	);

	if(predicate !== null) {
		return predicate;
	}

	throw new QueryError('Unsupported operator inside $elem_match: ' + operator_name, {
		operator: operator_name
	});
}

// Query-value casting

function compile_text_operator(
	operator_name,
	operator_value,
	casted_operator_value,
	regex_options,
	text_expression,
	parameter_state,
	error_message
) {
	if(operator_name === '$eq') {
		return eq_operator(text_expression, casted_operator_value, parameter_state);
	}

	if(operator_name === '$ne') {
		return ne_operator(text_expression, casted_operator_value, parameter_state);
	}

	if(operator_name === '$gt') {
		return gt_operator(text_expression, casted_operator_value, parameter_state);
	}

	if(operator_name === '$gte') {
		return gte_operator(text_expression, casted_operator_value, parameter_state);
	}

	if(operator_name === '$lt') {
		return lt_operator(text_expression, casted_operator_value, parameter_state);
	}

	if(operator_name === '$lte') {
		return lte_operator(text_expression, casted_operator_value, parameter_state);
	}

	if(operator_name === '$in') {
		return in_operator(text_expression, casted_operator_value, parameter_state);
	}

	if(operator_name === '$nin') {
		return nin_operator(text_expression, casted_operator_value, parameter_state);
	}

	if(operator_name === '$regex') {
		return regex_operator(text_expression, operator_value, regex_options, parameter_state);
	}

	if(
		operator_name === '$contains' ||
		operator_name === '$has_key' ||
		operator_name === '$has_any_keys' ||
		operator_name === '$has_all_keys' ||
		operator_name === '$json_path_exists' ||
		operator_name === '$json_path_match' ||
		operator_name === '$all' ||
		operator_name === '$size'
	) {
		return null;
	}

	throw new QueryError(error_message + ': ' + operator_name, {
		operator: operator_name
	});
}

function cast_operator_value(path_value, operator_name, operator_value, compile_context) {
	if(
		operator_name === '$eq' ||
		operator_name === '$ne' ||
		operator_name === '$gt' ||
		operator_name === '$gte' ||
		operator_name === '$lt' ||
		operator_name === '$lte'
	) {
		return cast_query_value(path_value, operator_value, compile_context);
	}

	if(operator_name === '$in' || operator_name === '$nin') {
		if(!Array.isArray(operator_value)) {
			return [cast_query_value(path_value, operator_value, compile_context)];
		}

		const casted_values = [];
		let value_index = 0;

		while(value_index < operator_value.length) {
			casted_values.push(cast_query_value(path_value, operator_value[value_index], compile_context));
			value_index += 1;
		}

		return casted_values;
	}

	if(operator_name === '$all') {
		if(!Array.isArray(operator_value)) {
			return operator_value;
		}

		const casted_values = [];
		let value_index = 0;

		while(value_index < operator_value.length) {
			casted_values.push(cast_array_contains_value(path_value, operator_value[value_index], compile_context));
			value_index += 1;
		}

		return casted_values;
	}

	return operator_value;
}

function cast_query_value(path_value, comparison_value, compile_context) {
	if(comparison_value === undefined || comparison_value === null) {
		return comparison_value;
	}

	const field_type = resolve_query_field_type(compile_context, path_value);

	if(!field_type || !is_function(field_type.cast)) {
		return comparison_value;
	}

	return field_type.cast(comparison_value, {
		path: path_value,
		mode: 'query'
	});
}

function cast_array_contains_value(path_value, comparison_value, compile_context) {
	const field_type = resolve_query_field_type(compile_context, path_value);

	if(!field_type || field_type.instance !== 'Array' || !field_type.of_field_type || !is_function(field_type.of_field_type.cast)) {
		return comparison_value;
	}

	return field_type.of_field_type.cast(comparison_value, {
		path: path_value,
		mode: 'query'
	});
}

// Schema/runtime helpers

function resolve_query_field_type(compile_context, path_value) {
	const schema_instance = compile_context.schema_instance;

	if(!schema_instance || !is_function(schema_instance.get_path)) {
		return null;
	}

	return schema_instance.get_path(path_value);
}

function should_use_array_contains(path_value, comparison_value, compile_context) {
	const schema_instance = compile_context.schema_instance;

	if(!schema_instance || !is_function(schema_instance.is_array_root)) {
		return false;
	}

	if(is_object(comparison_value) || comparison_value instanceof RegExp) {
		return false;
	}

	return schema_instance.is_array_root(path_value);
}

function is_array_root(compile_context, root_path) {
	const schema_instance = compile_context.schema_instance;

	if(!schema_instance || !is_function(schema_instance.is_array_root)) {
		return false;
	}

	return schema_instance.is_array_root(root_path);
}

function create_compile_context(compile_options) {
	const options = compile_options ?? {};
	const data_column_name = options.data_column ?? 'data';
	const data_column_reference = quote_identifier(data_column_name);
	const schema_instance = options.schema ?? null;
	const id_strategy = options.id_strategy === IdStrategies.uuidv7 ? IdStrategies.uuidv7 : IdStrategies.bigserial;

	return {
		data_column_reference: data_column_reference,
		schema_instance: schema_instance,
		id_strategy: id_strategy
	};
}

function has_operator_entries(object_value) {
	const keys = Object.keys(object_value);
	let key_index = 0;

	while(key_index < keys.length) {
		if(keys[key_index][0] === '$') {
			return true;
		}

		key_index += 1;
	}

	return false;
}

export default where_compiler;
