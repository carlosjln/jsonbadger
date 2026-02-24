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

import {create_parameter_state} from '#src/sql/parameter-binder.js';

import {quote_identifier} from '#src/utils/assert.js';
import {build_nested_object, split_dot_path} from '#src/utils/object-path.js';
import {is_object} from '#src/utils/value.js';

// TODO: might as well split into multiple files within the same directory

function where_compiler(query_filter, compile_options, start_index) {
	const filter_object = query_filter ?? {};
	const options = compile_options ?? {};
	const parameter_state = create_parameter_state(start_index);
	const clause_list = [];
	const filter_entries = Object.entries(filter_object);
	let entry_index = 0;

	while(entry_index < filter_entries.length) {
		const entry_pair = filter_entries[entry_index];
		const path_value = entry_pair[0];
		const comparison_value = entry_pair[1];
		const clause = compile_field_clause(path_value, comparison_value, options, parameter_state);

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

function compile_field_clause(path_value, comparison_value, compile_options, parameter_state) {
	const data_column_name = compile_options?.data_column ?? 'data';
	const data_column_reference = quote_identifier(data_column_name);
	const schema_instance = compile_options?.schema ?? null;
	const is_array_path = should_use_array_contains(path_value, comparison_value, schema_instance);

	if(comparison_value instanceof RegExp) {
		const text_expression = build_text_expression(data_column_reference, path_value);
		return regex_operator(text_expression, comparison_value.source, comparison_value.flags, parameter_state);
	}

	if(is_object(comparison_value)) {
		if(comparison_value.$elem_match !== undefined) {
			return compile_elem_match_clause(path_value, comparison_value.$elem_match, data_column_reference, parameter_state);
		}

		if(has_operator_entries(comparison_value)) {
			return compile_operator_object(path_value, comparison_value, data_column_reference, schema_instance, parameter_state);
		}

		const nested_object = build_nested_object(path_value, comparison_value);
		return contains_operator(data_column_reference, nested_object, parameter_state);
	}

	if(is_array_path) {
		const casted_array_value = cast_array_contains_value(path_value, comparison_value, schema_instance);
		const nested_object = build_nested_object(path_value, [casted_array_value]);
		return contains_operator(data_column_reference, nested_object, parameter_state);
	}

	const text_expression = build_text_expression(data_column_reference, path_value);
	const casted_comparison_value = cast_query_value(path_value, comparison_value, schema_instance);
	return eq_operator(text_expression, casted_comparison_value, parameter_state);
}

function compile_operator_object(path_value, operator_definition, data_column_reference, schema_instance, parameter_state) {
	const clause_list = [];
	const operator_entries = Object.entries(operator_definition);
	const path_info = parse_path(path_value);
	const regex_options = operator_definition.$options || '';
	const has_array_root = is_array_root(schema_instance, path_info.root_path) && path_info.child_segments.length > 0;
	let entry_index = 0;

	while(entry_index < operator_entries.length) {
		const operator_entry = operator_entries[entry_index];
		const operator_name = operator_entry[0];
		const operator_value = operator_entry[1];

		if(operator_name === '$options') {
			entry_index += 1;
			continue;
		}

		if(has_array_root) {
			clause_list.push(
				compile_nested_array_operator(
					operator_name,
					operator_value,
					regex_options,
					path_info,
					data_column_reference,
					parameter_state
				)
			);
			entry_index += 1;
			continue;
		}

		clause_list.push(
			compile_standard_operator(
				operator_name,
				operator_value,
				regex_options,
				path_value,
				data_column_reference,
				schema_instance,
				parameter_state
			)
		);
		entry_index += 1;
	}

	return clause_list.join(' AND ');
}

function compile_standard_operator(operator_name, operator_value, regex_options, path_value, data_column_reference, schema_instance, parameter_state) {
	const text_expression = build_text_expression(data_column_reference, path_value);
	const json_expression = build_json_expression(data_column_reference, path_value);
	const casted_operator_value = cast_operator_value(path_value, operator_name, operator_value, schema_instance);

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

	throw new Error('Unsupported operator: ' + operator_name);
}

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
		const operator_entries = Object.entries(elem_match_value);
		const option_value = elem_match_value.$options || '';
		let operator_index = 0;

		while(operator_index < operator_entries.length) {
			const operator_entry = operator_entries[operator_index];
			const operator_name = operator_entry[0];
			const operator_value = operator_entry[1];

			if(operator_name === '$options') {
				operator_index += 1;
				continue;
			}

			predicate_list.push(
				compile_scalar_operator(operator_name, operator_value, option_value, "elem #>> '{}'", parameter_state)
			);
			operator_index += 1;
		}

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
			const nested_operator_entries = Object.entries(nested_value);
			const option_value = nested_value.$options || '';
			let operator_index = 0;

			while(operator_index < nested_operator_entries.length) {
				const operator_entry = nested_operator_entries[operator_index];
				const operator_name = operator_entry[0];
				const operator_value = operator_entry[1];

				if(operator_name === '$options') {
					operator_index += 1;
					continue;
				}

				predicate_list.push(
					compile_scalar_operator(operator_name, operator_value, option_value, elem_expression, parameter_state)
				);
				operator_index += 1;
			}

			entry_index += 1;
			continue;
		}

		predicate_list.push(eq_operator(elem_expression, nested_value, parameter_state));
		entry_index += 1;
	}

	return elem_match_operator(array_expression, predicate_list.join(' AND '));
}

function compile_scalar_operator(operator_name, operator_value, regex_options, elem_expression, parameter_state) {
	if(operator_name === '$eq') {
		return eq_operator(elem_expression, operator_value, parameter_state);
	}

	if(operator_name === '$ne') {
		return ne_operator(elem_expression, operator_value, parameter_state);
	}

	if(operator_name === '$gt') {
		return gt_operator(elem_expression, operator_value, parameter_state);
	}

	if(operator_name === '$gte') {
		return gte_operator(elem_expression, operator_value, parameter_state);
	}

	if(operator_name === '$lt') {
		return lt_operator(elem_expression, operator_value, parameter_state);
	}

	if(operator_name === '$lte') {
		return lte_operator(elem_expression, operator_value, parameter_state);
	}

	if(operator_name === '$in') {
		return in_operator(elem_expression, operator_value, parameter_state);
	}

	if(operator_name === '$nin') {
		return nin_operator(elem_expression, operator_value, parameter_state);
	}

	if(operator_name === '$regex') {
		return regex_operator(elem_expression, operator_value, regex_options, parameter_state);
	}

	throw new Error('Unsupported operator inside $elem_match: ' + operator_name);
}

function cast_operator_value(path_value, operator_name, operator_value, schema_instance) {
	if(
		operator_name === '$eq' ||
		operator_name === '$ne' ||
		operator_name === '$gt' ||
		operator_name === '$gte' ||
		operator_name === '$lt' ||
		operator_name === '$lte'
	) {
		return cast_query_value(path_value, operator_value, schema_instance);
	}

	if(operator_name === '$in' || operator_name === '$nin') {
		if(!Array.isArray(operator_value)) {
			return [cast_query_value(path_value, operator_value, schema_instance)];
		}

		const casted_values = [];
		let value_index = 0;

		while(value_index < operator_value.length) {
			casted_values.push(cast_query_value(path_value, operator_value[value_index], schema_instance));
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
			casted_values.push(cast_array_contains_value(path_value, operator_value[value_index], schema_instance));
			value_index += 1;
		}

		return casted_values;
	}

	return operator_value;
}

function cast_query_value(path_value, comparison_value, schema_instance) {
	if(comparison_value === undefined || comparison_value === null) {
		return comparison_value;
	}

	const field_type = resolve_query_field_type(schema_instance, path_value);

	if(!field_type || typeof field_type.cast !== 'function') {
		return comparison_value;
	}

	return field_type.cast(comparison_value, {
		path: path_value,
		mode: 'query'
	});
}

function cast_array_contains_value(path_value, comparison_value, schema_instance) {
	const field_type = resolve_query_field_type(schema_instance, path_value);

	if(!field_type || field_type.instance !== 'Array' || !field_type.of_field_type || typeof field_type.of_field_type.cast !== 'function') {
		return comparison_value;
	}

	return field_type.of_field_type.cast(comparison_value, {
		path: path_value,
		mode: 'query'
	});
}

function resolve_query_field_type(schema_instance, path_value) {
	if(!schema_instance || typeof schema_instance.path !== 'function') {
		return null;
	}

	return schema_instance.path(path_value);
}

function should_use_array_contains(path_value, comparison_value, schema_instance) {
	if(!schema_instance || typeof schema_instance.is_array_root !== 'function') {
		return false;
	}

	if(is_object(comparison_value) || comparison_value instanceof RegExp) {
		return false;
	}

	return schema_instance.is_array_root(path_value);
}

function is_array_root(schema_instance, root_path) {
	if(!schema_instance || typeof schema_instance.is_array_root !== 'function') {
		return false;
	}

	return schema_instance.is_array_root(root_path);
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

