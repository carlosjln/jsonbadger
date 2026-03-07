import QueryError from '#src/errors/query-error.js';
import {bind_parameter} from '#src/sql/parameter-binder.js';
import IdStrategies from '#src/constants/id-strategies.js';
import {parse_path} from '#src/query/path-parser.js';
import {is_plain_object, is_uuid_v7} from '#src/utils/value.js';

// Base fields are top-level only. Each one owns its SQL expression and allowed operators.
const base_field_rules = Object.freeze({
	id: {
		expression: '"id"',
		operator_allowlist: new Set(['$eq', '$ne', '$in', '$nin']),
		value_kind: 'id'
	},
	created_at: {
		expression: '"created_at"',
		operator_allowlist: new Set(['$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$nin']),
		value_kind: 'timestamp'
	},
	updated_at: {
		expression: '"updated_at"',
		operator_allowlist: new Set(['$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$nin']),
		value_kind: 'timestamp'
	}
});

/**
 * Resolve the base-field name for a query path.
 *
 * @param {string} path_value Query path.
 * @returns {string|null}
 * @throws {QueryError} When a base field is used with a nested path.
 */
function resolve_base_field_name(path_value) {
	const path_info = parse_path(path_value);
	const root_path = path_info.root_path;

	if(!base_field_rules[root_path]) {
		return null;
	}

	if(path_info.is_nested) {
		throw new QueryError('Base fields only support top-level paths', {
			path: path_value,
			field: root_path
		});
	}

	return root_path;
}

/**
 * Compile one base-field clause.
 *
 * @param {string} field_name Base-field name.
 * @param {*} comparison_value Query value or operator object.
 * @param {object} compile_context Normalized where-compiler context.
 * @param {object} parameter_state SQL parameter state.
 * @returns {string}
 * @throws {QueryError} When the value or operator is invalid for the base field.
 */
function compile_base_field_clause(field_name, comparison_value, compile_context, parameter_state) {
	if(comparison_value instanceof RegExp) {
		throw new QueryError('Base field does not support regular expression matching', {
			field: field_name
		});
	}

	if(is_plain_object(comparison_value)) {
		if(comparison_value.$elem_match !== undefined) {
			throw new QueryError('Base field does not support $elem_match', {
				field: field_name
			});
		}

		if(!has_operator_entries(comparison_value)) {
			throw new QueryError('Base field only supports scalar values or operator objects', {
				field: field_name
			});
		}

		const clause_list = [];
		const operator_entries = Object.entries(comparison_value);
		let operator_index = 0;

		while(operator_index < operator_entries.length) {
			const operator_entry = operator_entries[operator_index];
			const operator_name = operator_entry[0];
			const operator_value = operator_entry[1];

			if(operator_name === '$options') {
				throw new QueryError('Base field does not support $options', {
					field: field_name
				});
			}

			assert_base_field_operator_supported(field_name, operator_name);
			clause_list.push(
				compile_base_field_operator(field_name, operator_name, operator_value, compile_context, parameter_state)
			);
			operator_index += 1;
		}

		return clause_list.join(' AND ');
	}

	const normalized_value = normalize_base_field_scalar(field_name, comparison_value, '$eq', compile_context);
	return build_base_field_comparison(field_name, '$eq', normalized_value, compile_context, parameter_state);
}

function compile_base_field_operator(field_name, operator_name, operator_value, compile_context, parameter_state) {
	if(operator_name === '$in' || operator_name === '$nin') {
		const normalized_values = normalize_base_field_list(field_name, operator_value, operator_name, compile_context);
		return build_base_field_comparison(field_name, operator_name, normalized_values, compile_context, parameter_state);
	}

	const normalized_value = normalize_base_field_scalar(field_name, operator_value, operator_name, compile_context);
	return build_base_field_comparison(field_name, operator_name, normalized_value, compile_context, parameter_state);
}

function build_base_field_comparison(field_name, operator_name, normalized_value, compile_context, parameter_state) {
	const field_rule = base_field_rules[field_name];
	const placeholder = bind_parameter(parameter_state, normalized_value);
	const field_expression = field_rule.expression;
	const id_parameter_cast = resolve_id_parameter_cast(compile_context.id_strategy);

	if(operator_name === '$eq') {
		if(field_rule.value_kind === 'id') {
			return field_expression + ' = ' + placeholder + id_parameter_cast;
		}

		return field_expression + ' = ' + placeholder + '::timestamptz';
	}

	if(operator_name === '$ne') {
		if(field_rule.value_kind === 'id') {
			return field_expression + ' != ' + placeholder + id_parameter_cast;
		}

		return field_expression + ' != ' + placeholder + '::timestamptz';
	}

	if(operator_name === '$gt') {
		return field_expression + ' > ' + placeholder + '::timestamptz';
	}

	if(operator_name === '$gte') {
		return field_expression + ' >= ' + placeholder + '::timestamptz';
	}

	if(operator_name === '$lt') {
		return field_expression + ' < ' + placeholder + '::timestamptz';
	}

	if(operator_name === '$lte') {
		return field_expression + ' <= ' + placeholder + '::timestamptz';
	}

	if(operator_name === '$in') {
		if(field_rule.value_kind === 'id') {
			const id_array_cast = id_parameter_cast === '::uuid' ? '::uuid[]' : '::bigint[]';
			return field_expression + ' = ANY(' + placeholder + id_array_cast + ')';
		}

		return field_expression + ' = ANY(' + placeholder + '::timestamptz[])';
	}

	if(operator_name === '$nin') {
		if(field_rule.value_kind === 'id') {
			const id_array_cast = id_parameter_cast === '::uuid' ? '::uuid[]' : '::bigint[]';
			return 'NOT (' + field_expression + ' = ANY(' + placeholder + id_array_cast + '))';
		}

		return 'NOT (' + field_expression + ' = ANY(' + placeholder + '::timestamptz[]))';
	}

	throw new QueryError('Unsupported operator for base field', {
		field: field_name,
		operator: operator_name
	});
}

function normalize_base_field_list(field_name, operator_value, operator_name, compile_context) {
	const input_values = Array.isArray(operator_value) ? operator_value : [operator_value];
	const normalized_values = [];
	let value_index = 0;

	while(value_index < input_values.length) {
		const next_value = normalize_base_field_scalar(field_name, input_values[value_index], operator_name, compile_context);
		normalized_values.push(next_value);
		value_index += 1;
	}

	return normalized_values;
}

function normalize_base_field_scalar(field_name, operator_value, operator_name, compile_context) {
	const field_rule = base_field_rules[field_name];

	if(operator_value === undefined || operator_value === null || Array.isArray(operator_value) || is_plain_object(operator_value)) {
		throw new QueryError('Invalid value for base field', {
			field: field_name,
			operator: operator_name,
			value: operator_value
		});
	}

	if(field_rule.value_kind === 'id') {
		return normalize_id_value(operator_value, operator_name, compile_context.id_strategy);
	}

	return normalize_timestamp_value(field_name, operator_name, operator_value);
}

function normalize_timestamp_value(field_name, operator_name, operator_value) {
	const parsed_timestamp = operator_value instanceof Date ? operator_value : new Date(operator_value);

	if(Number.isNaN(parsed_timestamp.getTime())) {
		throw new QueryError('Invalid timestamp value for base field', {
			field: field_name,
			operator: operator_name,
			value: operator_value
		});
	}

	return parsed_timestamp.toISOString();
}

function normalize_id_value(operator_value, operator_name, id_strategy) {
	if(id_strategy === IdStrategies.uuidv7) {
		const uuid_value = String(operator_value);

		if(!is_uuid_v7(uuid_value)) {
			throw new QueryError('Invalid id value for uuid id_strategy', {
				field: 'id',
				operator: operator_name,
				value: operator_value
			});
		}

		return uuid_value;
	}

	if(typeof operator_value === 'bigint') {
		return operator_value.toString();
	}

	if(typeof operator_value === 'number') {
		if(Number.isInteger(operator_value) === false) {
			throw new QueryError('Invalid id value for bigserial id_strategy', {
				field: 'id',
				operator: operator_name,
				value: operator_value
			});
		}

		return String(operator_value);
	}

	const numeric_value = String(operator_value);

	if(/^[0-9]+$/.test(numeric_value) === false) {
		throw new QueryError('Invalid id value for bigserial id_strategy', {
			field: 'id',
			operator: operator_name,
			value: operator_value
		});
	}

	return numeric_value;
}

function resolve_id_parameter_cast(id_strategy) {
	if(id_strategy === IdStrategies.uuidv7) {
		return '::uuid';
	}

	return '::bigint';
}

function assert_base_field_operator_supported(field_name, operator_name) {
	const field_rule = base_field_rules[field_name];

	if(field_rule.operator_allowlist.has(operator_name)) {
		return;
	}

	throw new QueryError('Operator is not supported for base field', {
		field: field_name,
		operator: operator_name
	});
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

export {
	compile_base_field_clause,
	resolve_base_field_name
};
