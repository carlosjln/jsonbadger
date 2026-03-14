import QueryError from '#src/errors/query-error.js';

import {bind_parameter} from '#src/sql/parameter-binder.js';
import {assert_condition} from '#src/utils/assert.js';
import {build_path_literal} from '#src/utils/object-path.js';
import {jsonb_stringify} from '#src/utils/json.js';
import {has_own} from '#src/utils/object.js';
import {is_function, is_not_object} from '#src/utils/value.js';

import {
	set_lax_null_treatments,
	timestamp_fields,
	update_operator_names,
	update_operator_order,
	update_path_nested_segment_pattern,
	update_path_root_segment_pattern
} from '#src/model/factory/constants.js';

// Cast an update value through the matching schema field type when available.
function cast_update_value(path_value, next_value, schema) {
	const field_type = resolve_update_field_type(path_value, schema);

	if(!field_type || !is_function(field_type.cast)) {
		return next_value;
	}

	let casted_value = next_value;

	if(is_function(field_type.apply_set)) {
		casted_value = field_type.apply_set(casted_value, {path: path_value, mode: 'update'});
	}

	return field_type.cast(casted_value, {path: path_value, mode: 'update'});
}

// Validate that an operator definition is an object.
function assert_update_operator_definition_type(operator_name, definition, allowed_operators) {
	if(is_not_object(definition)) {
		throw new QueryError('update_definition.' + operator_name + ' must be an object', {
			allowed: allowed_operators
		});
	}
}

// Validate the supported update definition for update_one().
function assert_supported_update_definition(update_definition, update_operator_entries) {
	const allowed_operators = update_operator_order.slice();
	const update_object = update_definition ?? {};
	const update_operator_names_in_definition = Object.keys(update_object);

	if(is_not_object(update_object)) {
		throw new QueryError('update_definition must be an object', {
			allowed: allowed_operators
		});
	}

	if(update_operator_entries.length === 0) {
		throw new QueryError('update_one requires at least one supported update operator', {
			allowed: allowed_operators
		});
	}

	for(const operator_name of update_operator_names_in_definition) {
		if(!allowed_operators.includes(operator_name)) {
			throw new QueryError('Unsupported update operator', {
				operator: operator_name,
				allowed: allowed_operators
			});
		}
	}

	for(const update_operator_entry of update_operator_entries) {
		update_operator_entry.operator_descriptor.assert_definition(update_operator_entry.definition, allowed_operators);
	}

	const update_path_entries = collect_update_path_entries(update_operator_entries);

	assert_no_conflicting_update_paths(update_path_entries);
}

// Validate that `$set` is present as an object payload.
function assert_set_definition(definition, allowed_operators) {
	assert_update_operator_definition_type(update_operator_names.set, definition, allowed_operators);
}

// Validate that `$insert` is present as an object payload.
function assert_insert_definition(definition, allowed_operators) {
	assert_update_operator_definition_type(update_operator_names.insert, definition, allowed_operators);
}

// Validate that `$set_lax` is present as an object payload.
function assert_set_lax_definition(definition, allowed_operators) {
	assert_update_operator_definition_type(update_operator_names.set_lax, definition, allowed_operators);
}

// Reject conflicting update paths inside a single update request.
function assert_no_conflicting_update_paths(update_path_entries) {
	for(let left_index = 0; left_index < update_path_entries.length; left_index++) {
		for(let right_index = left_index + 1; right_index < update_path_entries.length; right_index++) {
			const left_entry = update_path_entries[left_index];
			const right_entry = update_path_entries[right_index];

			if(do_update_paths_conflict(left_entry.path, right_entry.path)) {
				throw new QueryError('Conflicting update paths are not allowed in a single update_one call', {
					left: left_entry,
					right: right_entry
				});
			}
		}
	}
}

// Validate the allowed null treatment options for $set_lax.
function assert_valid_set_lax_null_treatment(path_value, null_value_treatment) {
	const allowed_null_treatments = Object.values(set_lax_null_treatments);

	assert_condition(
		allowed_null_treatments.includes(null_value_treatment),
		'$set_lax.null_value_treatment for path "' + path_value + '" must be one of: ' + allowed_null_treatments.join(', ')
	);
}

// Split $set updates between payload data and row timestamps.
function split_set_updates(set_definition) {
	const split_definition = {
		data_set: {},
		timestamp_set: {}
	};

	if(set_definition === undefined) {
		return split_definition;
	}

	for(const [path_value, next_value] of Object.entries(set_definition)) {
		const root_path = path_value.split('.')[0];

		if(timestamp_fields.has(root_path)) {
			assert_condition(path_value === root_path, 'Timestamp updates must use top-level paths only');
			split_definition.timestamp_set[root_path] = normalize_row_timestamp_update(root_path, next_value);
			continue;
		}

		split_definition.data_set[path_value] = next_value;
	}

	return split_definition;
}

// Pull the `$set` payload from the full update object.
function get_set_definition(update_definition) {
	return update_definition[update_operator_names.set];
}

// Collect `$set` paths so the shared conflict checker can inspect them.
function collect_set_paths(definition) {
	if(definition === undefined) {
		return [];
	}

	return Object.keys(definition);
}

// Apply `$set` to the JSONB expression and surface timestamp writes separately.
function apply_set_definition(apply_context) {
	const split_definition = split_set_updates(apply_context.definition);
	const next_data_expression = apply_set_updates(
		apply_context.data_expression,
		split_definition.data_set,
		apply_context.parameter_state,
		apply_context.schema
	);

	return {
		data_expression: next_data_expression,
		timestamp_set: split_definition.timestamp_set
	};
}

// Apply $set updates to a JSONB expression.
function apply_set_updates(data_expression, set_definition, parameter_state, schema) {
	let next_expression = data_expression;

	for(const [path, value] of Object.entries(set_definition)) {
		const casted_value = cast_update_value(path, value, schema);
		const path_literal = build_update_path_literal(path);
		const placeholder = bind_parameter(parameter_state, jsonb_stringify(casted_value));

		next_expression = 'jsonb_set(' + next_expression + ", '" + path_literal + "', " + placeholder + '::jsonb, true)';
	}

	return next_expression;
}

// Pull the `$insert` payload from the full update object.
function get_insert_definition(update_definition) {
	return update_definition[update_operator_names.insert];
}

// Collect `$insert` paths so the shared conflict checker can inspect them.
function collect_insert_paths(definition) {
	if(definition === undefined) {
		return [];
	}

	return Object.keys(definition);
}

// Apply `$insert` updates to the current JSONB expression.
function apply_insert_definition(apply_context) {
	const next_data_expression = apply_insert_updates(
		apply_context.data_expression,
		apply_context.definition,
		apply_context.parameter_state,
		apply_context.schema
	);

	return {
		data_expression: next_data_expression
	};
}

// Apply $insert updates to a JSONB expression.
function apply_insert_updates(data_expression, insert_definition, parameter_state, schema) {
	if(insert_definition === undefined) {
		return data_expression;
	}

	let next_expression = data_expression;

	for(const [path, definition_value] of Object.entries(insert_definition)) {
		const insert_config = normalize_insert_update(path, definition_value);
		const casted_value = cast_update_value(path, insert_config.value, schema);
		const path_literal = build_update_path_literal(path);
		const value_placeholder = bind_parameter(parameter_state, jsonb_stringify(casted_value));
		const insert_after_sql = insert_config.insert_after ? 'true' : 'false';

		next_expression =
			'jsonb_insert(' + next_expression + ", '" + path_literal + "', " + value_placeholder + '::jsonb, ' + insert_after_sql + ')';
	}

	return next_expression;
}

// Pull the `$set_lax` payload from the full update object.
function get_set_lax_definition(update_definition) {
	return update_definition[update_operator_names.set_lax];
}

// Collect `$set_lax` paths so the shared conflict checker can inspect them.
function collect_set_lax_paths(definition) {
	if(definition === undefined) {
		return [];
	}

	return Object.keys(definition);
}

// Apply `$set_lax` updates to the current JSONB expression.
function apply_set_lax_definition(apply_context) {
	const next_data_expression = apply_set_lax_updates(
		apply_context.data_expression,
		apply_context.definition,
		apply_context.parameter_state,
		apply_context.schema
	);

	return {
		data_expression: next_data_expression
	};
}

// Apply $set_lax updates to a JSONB expression.
function apply_set_lax_updates(data_expression, set_lax_definition, parameter_state, schema) {
	if(set_lax_definition === undefined) {
		return data_expression;
	}

	let next_expression = data_expression;

	for(const [path, definition_value] of Object.entries(set_lax_definition)) {
		const set_lax_config = normalize_set_lax_update(path, definition_value);
		const casted_value = cast_update_value(path, set_lax_config.value, schema);
		const path_literal = build_update_path_literal(path);
		const value_placeholder = bind_parameter(parameter_state, cast_update_parameter_value(casted_value));
		const create_if_missing_sql = set_lax_config.create_if_missing ? 'true' : 'false';

		next_expression =
			'jsonb_set_lax(' + next_expression + ", '" + path_literal + "', " + value_placeholder + '::jsonb, ' +
			create_if_missing_sql + ", '" + set_lax_config.null_value_treatment + "')";
	}

	return next_expression;
}

const update_operator_registry = Object.freeze({
	[update_operator_names.set]: Object.freeze({
		get_definition: get_set_definition,
		assert_definition: assert_set_definition,
		collect_paths: collect_set_paths,
		apply: apply_set_definition
	}),
	[update_operator_names.insert]: Object.freeze({
		get_definition: get_insert_definition,
		assert_definition: assert_insert_definition,
		collect_paths: collect_insert_paths,
		apply: apply_insert_definition
	}),
	[update_operator_names.set_lax]: Object.freeze({
		get_definition: get_set_lax_definition,
		assert_definition: assert_set_lax_definition,
		collect_paths: collect_set_lax_paths,
		apply: apply_set_lax_definition
	})
});

// Normalize only the supported operator entries, in the order the compiler applies them.
function normalize_update_operator_entries(update_definition) {
	const update_object = update_definition ?? {};
	const update_operator_entries = [];

	for(const operator_name of update_operator_order) {
		const operator_descriptor = update_operator_registry[operator_name];
		const definition = operator_descriptor.get_definition(update_object);

		if(definition === undefined) {
			continue;
		}

		update_operator_entries.push({
			operator_name: operator_name,
			definition: definition,
			operator_descriptor: operator_descriptor
		});
	}

	return update_operator_entries;
}

// Detect missing-relation query errors returned through QueryError.
function is_missing_relation_query_error(error) {
	if(!(error instanceof QueryError)) {
		return false;
	}

	const cause_message = error.details && error.details.cause;

	if(typeof cause_message !== 'string') {
		return false;
	}

	return cause_message.indexOf('relation ') !== -1 && cause_message.indexOf('does not exist') !== -1;
}

// Resolve the schema field type for an update path when available.
function resolve_update_field_type(path_value, schema) {
	if(!schema || !is_function(schema.get_path)) {
		return null;
	}

	return schema.get_path(path_value);
}

// Normalize a row timestamp update into an ISO string.
function normalize_row_timestamp_update(path_value, next_value) {
	const parsed_timestamp = next_value instanceof Date ? next_value : new Date(next_value);

	if(Number.isNaN(parsed_timestamp.getTime())) {
		throw new QueryError('Invalid timestamp value for update path', {
			path: path_value,
			value: next_value
		});
	}

	return parsed_timestamp.toISOString();
}

// Build a PostgreSQL path literal for an update path.
function build_update_path_literal(path_value) {
	return build_path_literal(parse_update_path(path_value));
}

// Collect normalized update path entries for conflict validation.
function collect_update_path_entries(update_operator_entries) {
	const update_path_entries = [];

	for(const operator_entry of update_operator_entries) {
		const definition = operator_entry.definition;

		if(definition === undefined) {
			continue;
		}

		const path_list = operator_entry.operator_descriptor.collect_paths(definition);

		for(const path of path_list) {
			parse_update_path(path, operator_entry.operator_name);
			update_path_entries.push({
				operator_name: operator_entry.operator_name,
				path: path
			});
		}
	}

	return update_path_entries;
}

// Determine whether two update paths conflict.
function do_update_paths_conflict(left_path, right_path) {
	if(left_path === right_path) {
		return true;
	}

	return left_path.indexOf(right_path + '.') === 0 || right_path.indexOf(left_path + '.') === 0;
}

// Parse and validate an update path into its path segments.
function parse_update_path(path_value, operator_name) {
	const path_segments = path_value.split('.');

	for(let segment_index = 0; segment_index < path_segments.length; segment_index++) {
		const segment_value = path_segments[segment_index];
		const is_root = segment_index === 0;

		if(segment_value.length === 0) {
			throw new QueryError('Update path contains an empty segment', {
				operator: operator_name,
				path: path_value
			});
		}

		if(is_root && !update_path_root_segment_pattern.test(segment_value)) {
			throw new QueryError('Update path root segment has invalid characters', {
				operator: operator_name,
				path: path_value
			});
		}

		if(is_root && segment_value === 'id') {
			throw new QueryError('Update path targets read-only id field', {
				operator: operator_name,
				path: path_value,
				field: segment_value
			});
		}

		if(is_root && timestamp_fields.has(segment_value)) {
			if(operator_name !== update_operator_names.set) {
				throw new QueryError('Timestamp fields only support $set updates', {
					operator: operator_name,
					path: path_value,
					field: segment_value
				});
			}

			if(path_value !== segment_value) {
				throw new QueryError('Timestamp fields only support top-level update paths', {
					operator: operator_name,
					path: path_value,
					field: segment_value
				});
			}
		}

		if(!is_root && !update_path_nested_segment_pattern.test(segment_value)) {
			throw new QueryError('Update path contains an invalid nested segment', {
				operator: operator_name,
				path: path_value
			});
		}
	}

	return path_segments;
}

// Normalize an update parameter value for jsonb_set_lax.
function cast_update_parameter_value(casted_value) {
	if(casted_value === null) {
		return null;
	}

	return jsonb_stringify(casted_value);
}

// Normalize a $insert definition entry.
function normalize_insert_update(path_value, insert_definition_value) {
	if(is_not_object(insert_definition_value)) {
		return {
			value: insert_definition_value,
			insert_after: false
		};
	}

	assert_condition(has_own(insert_definition_value, 'value'), '$insert entry for path "' + path_value + '" must include value');

	if(insert_definition_value.insert_after !== undefined) {
		assert_condition(
			typeof insert_definition_value.insert_after === 'boolean',
			'$insert.insert_after for path "' + path_value + '" must be a boolean'
		);
	}

	return {
		value: insert_definition_value.value,
		insert_after: insert_definition_value.insert_after === true
	};
}

// Normalize a $set_lax definition entry.
function normalize_set_lax_update(path_value, set_lax_definition_value) {
	if(is_not_object(set_lax_definition_value)) {
		return {
			value: set_lax_definition_value,
			create_if_missing: true,
			null_value_treatment: set_lax_null_treatments.use_json_null
		};
	}

	assert_condition(has_own(set_lax_definition_value, 'value'), '$set_lax entry for path "' + path_value + '" must include value');

	if(set_lax_definition_value.create_if_missing !== undefined) {
		assert_condition(
			typeof set_lax_definition_value.create_if_missing === 'boolean',
			'$set_lax.create_if_missing for path "' + path_value + '" must be a boolean'
		);
	}

	const null_value_treatment = set_lax_definition_value.null_value_treatment ?? set_lax_null_treatments.use_json_null;
	assert_valid_set_lax_null_treatment(path_value, null_value_treatment);

	return {
		value: set_lax_definition_value.value,
		create_if_missing: set_lax_definition_value.create_if_missing !== false,
		null_value_treatment: null_value_treatment
	};
}

export {
	normalize_update_operator_entries,
	assert_supported_update_definition,
	is_missing_relation_query_error
};
