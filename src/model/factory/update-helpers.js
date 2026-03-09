import QueryError from '#src/errors/query-error.js';

import {bind_parameter} from '#src/sql/parameter-binder.js';
import {assert_condition} from '#src/utils/assert.js';
import {build_path_literal} from '#src/utils/object-path.js';
import {jsonb_stringify} from '#src/utils/json.js';
import {has_own} from '#src/utils/object.js';
import {is_not_object} from '#src/utils/value.js';

import {
	timestamp_fields,
	update_path_nested_segment_pattern,
	update_path_root_segment_pattern
} from '#src/model/factory/constants.js';

/**
 * Casts an update value through the matching schema field type when available.
 *
 * @param {string} path_value Update path.
 * @param {*} next_value Incoming update value.
 * @param {object} schema_instance Schema-like object.
 * @returns {*}
 */
function cast_update_value(path_value, next_value, schema_instance) {
	const field_type = resolve_update_field_type(path_value, schema_instance);

	if(!field_type || typeof field_type.cast !== 'function') {
		return next_value;
	}

	let casted_value = next_value;

	if(typeof field_type.apply_set === 'function') {
		casted_value = field_type.apply_set(casted_value, {path: path_value, mode: 'update'});
	}

	return field_type.cast(casted_value, {path: path_value, mode: 'update'});
}

/**
 * Validates the supported update operator payloads for update_one().
 *
 * @param {*} set_definition $set payload.
 * @param {*} insert_definition $insert payload.
 * @param {*} set_lax_definition $set_lax payload.
 * @returns {void}
 * @throws {QueryError}
 */
function assert_supported_update_definition(set_definition, insert_definition, set_lax_definition) {
	const has_set_updates = set_definition !== undefined;
	const has_insert_updates = insert_definition !== undefined;
	const has_set_lax_updates = set_lax_definition !== undefined;
	const allowed_operators = ['$set', '$insert', '$set_lax'];

	if(!has_set_updates && !has_insert_updates && !has_set_lax_updates) {
		throw new QueryError('update_one requires at least one supported update operator', {
			allowed: allowed_operators
		});
	}

	if(has_set_updates && is_not_object(set_definition)) {
		throw new QueryError('update_definition.$set must be an object', {allowed: allowed_operators});
	}

	if(has_insert_updates && is_not_object(insert_definition)) {
		throw new QueryError('update_definition.$insert must be an object', {allowed: allowed_operators});
	}

	if(has_set_lax_updates && is_not_object(set_lax_definition)) {
		throw new QueryError('update_definition.$set_lax must be an object', {allowed: allowed_operators});
	}

	const update_path_entries = collect_update_path_entries([
		{operator_name: '$set', definition: set_definition},
		{operator_name: '$insert', definition: insert_definition},
		{operator_name: '$set_lax', definition: set_lax_definition}
	]);

	assert_no_conflicting_update_paths(update_path_entries);
}

/**
 * Splits $set updates between payload data and row timestamps.
 *
 * @param {object|undefined} set_definition $set payload.
 * @returns {{data_set: object, timestamp_set: object}}
 */
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

		if(root_path === 'created_at' || root_path === 'updated_at') {
			assert_condition(path_value === root_path, 'Timestamp updates must use top-level paths only');
			split_definition.timestamp_set[root_path] = normalize_row_timestamp_update(root_path, next_value);
			continue;
		}

		split_definition.data_set[path_value] = next_value;
	}

	return split_definition;
}

/**
 * Applies $set updates to a JSONB expression.
 *
 * @param {string} data_expression Current JSONB expression.
 * @param {object} set_definition Split $set payload.
 * @param {object} parameter_state SQL parameter state.
 * @param {object} schema_instance Schema-like object.
 * @returns {string}
 */
function apply_set_updates(data_expression, set_definition, parameter_state, schema_instance) {
	let next_expression = data_expression;

	for(const [path, value] of Object.entries(set_definition)) {
		const casted_value = cast_update_value(path, value, schema_instance);
		const path_literal = build_update_path_literal(path);
		const placeholder = bind_parameter(parameter_state, jsonb_stringify(casted_value));

		next_expression = 'jsonb_set(' + next_expression + ", '" + path_literal + "', " + placeholder + '::jsonb, true)';
	}

	return next_expression;
}

/**
 * Applies $insert updates to a JSONB expression.
 *
 * @param {string} data_expression Current JSONB expression.
 * @param {object|undefined} insert_definition $insert payload.
 * @param {object} parameter_state SQL parameter state.
 * @param {object} schema_instance Schema-like object.
 * @returns {string}
 */
function apply_insert_updates(data_expression, insert_definition, parameter_state, schema_instance) {
	if(insert_definition === undefined) {
		return data_expression;
	}

	let next_expression = data_expression;

	for(const [path, definition_value] of Object.entries(insert_definition)) {
		const insert_config = normalize_insert_update(path, definition_value);
		const casted_value = cast_update_value(path, insert_config.value, schema_instance);
		const path_literal = build_update_path_literal(path);
		const value_placeholder = bind_parameter(parameter_state, jsonb_stringify(casted_value));
		const insert_after_sql = insert_config.insert_after ? 'true' : 'false';

		next_expression =
			'jsonb_insert(' + next_expression + ", '" + path_literal + "', " + value_placeholder + '::jsonb, ' + insert_after_sql + ')';
	}

	return next_expression;
}

/**
 * Applies $set_lax updates to a JSONB expression.
 *
 * @param {string} data_expression Current JSONB expression.
 * @param {object|undefined} set_lax_definition $set_lax payload.
 * @param {object} parameter_state SQL parameter state.
 * @param {object} schema_instance Schema-like object.
 * @returns {string}
 */
function apply_set_lax_updates(data_expression, set_lax_definition, parameter_state, schema_instance) {
	if(set_lax_definition === undefined) {
		return data_expression;
	}

	let next_expression = data_expression;

	for(const [path, definition_value] of Object.entries(set_lax_definition)) {
		const set_lax_config = normalize_set_lax_update(path, definition_value);
		const casted_value = cast_update_value(path, set_lax_config.value, schema_instance);
		const path_literal = build_update_path_literal(path);
		const value_placeholder = bind_parameter(parameter_state, cast_update_parameter_value(casted_value));
		const create_if_missing_sql = set_lax_config.create_if_missing ? 'true' : 'false';

		next_expression =
			'jsonb_set_lax(' + next_expression + ", '" + path_literal + "', " + value_placeholder + '::jsonb, ' +
			create_if_missing_sql + ", '" + set_lax_config.null_value_treatment + "')";
	}

	return next_expression;
}

/**
 * Detects missing-relation query errors returned through QueryError.
 *
 * @param {*} error Candidate error value.
 * @returns {boolean}
 */
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

/**
 * Resolves the schema field type for an update path when available.
 *
 * @param {string} path_value Update path.
 * @param {object} schema_instance Schema-like object.
 * @returns {*}
 */
function resolve_update_field_type(path_value, schema_instance) {
	if(!schema_instance || typeof schema_instance.get_path !== 'function') {
		return null;
	}

	return schema_instance.get_path(path_value);
}

/**
 * Normalizes a row timestamp update into an ISO string.
 *
 * @param {string} path_value Timestamp path.
 * @param {*} next_value Incoming timestamp value.
 * @returns {string}
 * @throws {QueryError}
 */
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

/**
 * Builds a PostgreSQL path literal for an update path.
 *
 * @param {string} path_value Update path.
 * @returns {string}
 */
function build_update_path_literal(path_value) {
	return build_path_literal(parse_update_path(path_value));
}

/**
 * Collects normalized update path entries for conflict validation.
 *
 * @param {Array<{operator_name: string, definition: object|undefined}>} update_operator_entries Operator entries.
 * @returns {Array<{operator_name: string, path: string}>}
 */
function collect_update_path_entries(update_operator_entries) {
	const update_path_entries = [];

	for(const operator_entry of update_operator_entries) {
		const definition = operator_entry.definition;

		if(definition === undefined) {
			continue;
		}

		for(const path of Object.keys(definition)) {
			parse_update_path(path, operator_entry.operator_name);
			update_path_entries.push({
				operator_name: operator_entry.operator_name,
				path: path
			});
		}
	}

	return update_path_entries;
}

/**
 * Rejects conflicting update paths inside a single update request.
 *
 * @param {Array<{operator_name: string, path: string}>} update_path_entries Collected update paths.
 * @returns {void}
 * @throws {QueryError}
 */
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

/**
 * Determines whether two update paths conflict.
 *
 * @param {string} left_path Left update path.
 * @param {string} right_path Right update path.
 * @returns {boolean}
 */
function do_update_paths_conflict(left_path, right_path) {
	if(left_path === right_path) {
		return true;
	}

	return left_path.indexOf(right_path + '.') === 0 || right_path.indexOf(left_path + '.') === 0;
}

/**
 * Parses and validates an update path into its path segments.
 *
 * @param {string} path_value Update path.
 * @param {string} operator_name Update operator name.
 * @returns {string[]}
 * @throws {QueryError}
 */
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
			if(operator_name !== '$set') {
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

/**
 * Normalizes an update parameter value for jsonb_set_lax.
 *
 * @param {*} casted_value Casted update value.
 * @returns {*}
 */
function cast_update_parameter_value(casted_value) {
	if(casted_value === null) {
		return null;
	}

	return jsonb_stringify(casted_value);
}

/**
 * Normalizes a $insert definition entry.
 *
 * @param {string} path_value Update path.
 * @param {*} insert_definition_value Raw $insert entry value.
 * @returns {{value: *, insert_after: boolean}}
 */
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

/**
 * Normalizes a $set_lax definition entry.
 *
 * @param {string} path_value Update path.
 * @param {*} set_lax_definition_value Raw $set_lax entry value.
 * @returns {{value: *, create_if_missing: boolean, null_value_treatment: string}}
 */
function normalize_set_lax_update(path_value, set_lax_definition_value) {
	if(is_not_object(set_lax_definition_value)) {
		return {
			value: set_lax_definition_value,
			create_if_missing: true,
			null_value_treatment: 'use_json_null'
		};
	}

	assert_condition(has_own(set_lax_definition_value, 'value'), '$set_lax entry for path "' + path_value + '" must include value');

	if(set_lax_definition_value.create_if_missing !== undefined) {
		assert_condition(
			typeof set_lax_definition_value.create_if_missing === 'boolean',
			'$set_lax.create_if_missing for path "' + path_value + '" must be a boolean'
		);
	}

	const null_value_treatment = set_lax_definition_value.null_value_treatment ?? 'use_json_null';
	assert_valid_set_lax_null_treatment(path_value, null_value_treatment);

	return {
		value: set_lax_definition_value.value,
		create_if_missing: set_lax_definition_value.create_if_missing !== false,
		null_value_treatment: null_value_treatment
	};
}

/**
 * Validates the allowed null treatment options for $set_lax.
 *
 * @param {string} path_value Update path.
 * @param {string} null_value_treatment Null treatment value.
 * @returns {void}
 */
function assert_valid_set_lax_null_treatment(path_value, null_value_treatment) {
	const allowed_null_treatments = ['raise_exception', 'use_json_null', 'delete_key', 'return_target'];
	assert_condition(
		allowed_null_treatments.includes(null_value_treatment),
		'$set_lax.null_value_treatment for path "' + path_value + '" must be one of: ' + allowed_null_treatments.join(', ')
	);
}

export {
	apply_insert_updates,
	apply_set_lax_updates,
	apply_set_updates,
	assert_supported_update_definition,
	cast_update_value,
	is_missing_relation_query_error,
	split_set_updates
};
