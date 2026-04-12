/*
 * MODULE RESPONSIBILITY
 * Bridge model-layer update input into the SQL update context.
 */
import sql from '#src/sql/index.js';
import where_compiler from '#src/sql/read/where/index.js';
import {create_parameter_state} from '#src/sql/parameter-binder.js';

import {JsonbOps} from '#src/sql/jsonb/ops.js';
import {timestamp_fields} from '#src/model/factory/constants.js';
import {is_array} from '#src/utils/array.js';
import {quote_identifier} from '#src/utils/assert.js';
import {expand_dot_paths} from '#src/utils/object-path.js';
import {has_own} from '#src/utils/object.js';
import {is_not_object, is_object, is_plain_object} from '#src/utils/value.js';

// --- PUBLIC API ---

/**
 * Execute Model.update_one() by coordinating syntax parsing and SQL generation.
 *
 * @param {Function} model
 * @param {object} query_filter
 * @param {object} update_definition
 * @returns {Promise<object|null>}
 */
async function exec_update_one(model, query_filter, update_definition) {
	if(is_not_object(update_definition) || Object.keys(update_definition).length === 0) {
		return null;
	}

	const model_options = model.options;
	const data_column = model_options.data_column;

	const gateway_definition = normalize_update_gateway(update_definition);
	const {timestamp_set, payload} = normalize_update_definition(gateway_definition, data_column);

	const data_identifier = quote_identifier(data_column);
	const jsonb_ops = JsonbOps.from(payload, {
		column_name: data_identifier,
		coalesce: true
	});

	const where_result = where_compiler(query_filter, {
		schema: model.schema,
		data_column
	});

	const parameter_state = create_parameter_state(where_result.next_index);

	const query_context = {
		model,
		table_identifier: quote_identifier(model_options.table_name),
		data_identifier,
		where_result,
		parameter_state,
		update_expression: {
			jsonb_ops,
			timestamp_set
		}
	};

	const update_query = sql.build_update_query(query_context);
	const query_result = await sql.run(update_query.sql_text, update_query.sql_params, model.connection);
	const row = query_result.rows.length ? query_result.rows[0] : null;

	return row;
}

// --- LOCAL HELPER FUNCTIONS ---

/**
 * Expand public dotted update input before the existing router consumes it.
 *
 * @param {object} update_definition
 * @returns {object}
 * @throws {Error} If update input includes invalid or restricted dotted paths.
 */
function normalize_update_gateway(update_definition) {
	if(is_tracker_delta_update(update_definition)) {
		return update_definition;
	}

	const implicit_definition = {};
	const normalized_definition = {};

	for(const [key, value] of Object.entries(update_definition)) {
		if(key.startsWith('$')) {
			normalized_definition[key] = normalize_update_operator_value(key, value);
			continue;
		}

		implicit_definition[key] = value;
	}

	return Object.assign({}, normalized_definition, expand_dot_paths(implicit_definition));
}

/**
 * Detect the internal tracker delta shape so public gateway expansion stays out of that path.
 *
 * @param {object} update_definition
 * @returns {boolean}
 */
function is_tracker_delta_update(update_definition) {
	return is_object(update_definition) && (
		has_own(update_definition, 'set') ||
		has_own(update_definition, 'unset') ||
		has_own(update_definition, 'replace_roots')
	);
}

/**
 * Normalize one operator payload before the router turns it into SQL-oriented state.
 *
 * @param {string} operator_name
 * @param {*} operator_value
 * @returns {*}
 * @throws {Error} If operator input includes invalid or restricted dotted paths.
 */
function normalize_update_operator_value(operator_name, operator_value) {
	if((operator_name === '$set' || operator_name === '$replace_roots') && is_object(operator_value)) {
		return expand_dot_paths(operator_value);
	}

	return operator_value;
}

/**
 * Normalize one update definition into row timestamps plus operator-style JSONB payload.
 *
 * @param {object} update_definition
 * @param {string} data_column
 * @returns {{timestamp_set: object, payload: object}}
 */
function normalize_update_definition(update_definition, data_column) {
	const timestamp_set = {};
	const payload = pull_timestamp_fields(update_definition, timestamp_set);

	merge_tracked_set(payload, data_column, timestamp_set);
	merge_tracked_unset(payload, data_column);
	merge_tracked_replace_roots(payload, data_column);
	move_implicit_set_values(payload);

	return {timestamp_set, payload};
}

/**
 * Safely map tracker-emitted "set" objects to the explicit "$set" bucket.
 *
 * @param {object} payload
 * @param {string} data_column
 * @param {object} timestamp_set
 * @returns {void}
 */
function merge_tracked_set(payload, data_column, timestamp_set) {
	if(is_object(payload.$set)) {
		payload.$set = flatten_update_paths(pull_timestamp_fields(payload.$set, timestamp_set));
	}

	if(!is_object(payload.set)) {
		return;
	}

	const tracked_set = pull_timestamp_fields(payload.set, timestamp_set);
	const set_payload = is_object(payload.$set) ? payload.$set : {};

	delete payload.set;
	payload.$set = set_payload;

	for(const [path_name, value] of Object.entries(tracked_set)) {
		const next_path = strip_tracked_root(path_name, data_column);

		if(next_path !== '') {
			set_payload[next_path] = value;
		}
	}
}

/**
 * Safely map tracker-emitted "unset" arrays to the explicit "$unset" bucket.
 *
 * @param {object} payload
 * @param {string} data_column
 * @returns {void}
 */
function merge_tracked_unset(payload, data_column) {
	if(!is_array(payload.unset)) {
		return;
	}

	const tracked_unset = payload.unset;
	const unset_payload = is_array(payload.$unset) ? payload.$unset : [];

	delete payload.unset;
	payload.$unset = unset_payload;

	for(const path_name of tracked_unset) {
		const next_path = strip_tracked_root(path_name, data_column);

		if(next_path === '') {
			payload.$replace_roots = {};
		} else {
			unset_payload.push(next_path);
		}
	}
}

/**
 * Safely map tracker-emitted "replace_roots" objects to the explicit "$replace_roots" bucket.
 *
 * @param {object} payload
 * @param {string} data_column
 * @returns {void}
 */
function merge_tracked_replace_roots(payload, data_column) {
	if(!is_object(payload.replace_roots)) {
		return;
	}

	const next_root_payload = payload.replace_roots[data_column];
	delete payload.replace_roots;

	if(next_root_payload !== undefined) {
		payload.$replace_roots = next_root_payload;
	}
}

/**
 * Extract supported row timestamp fields from one payload object.
 *
 * @param {object} source_object
 * @param {object} timestamp_set
 * @returns {object}
 */
function pull_timestamp_fields(source_object, timestamp_set) {
	const next_object = {...source_object};

	for(const key of timestamp_fields) {
		if(has_own(next_object, key)) {
			timestamp_set[key] = next_object[key];
			delete next_object[key];
		}
	}

	return next_object;
}

/**
 * Move implicit object keys into the explicit `$set` bucket as leaf dot paths.
 *
 * @param {object} payload
 * @returns {void}
 */
function move_implicit_set_values(payload) {
	const implicit_source = {};

	for(const [key, value] of Object.entries(payload)) {
		if(key.startsWith('$')) {
			continue;
		}

		implicit_source[key] = value;
		delete payload[key];
	}

	if(Object.keys(implicit_source).length === 0) {
		return;
	}

	const implicit_set = flatten_update_paths(implicit_source);
	const set_payload = is_object(payload.$set) ? payload.$set : {};

	payload.$set = set_payload;
	Object.assign(set_payload, implicit_set);
}

/**
 * Flatten nested object updates into leaf dot-path assignments for JSONB mutation.
 *
 * @param {object} source_object
 * @param {string} [parent_path]
 * @returns {object}
 */
function flatten_update_paths(source_object, parent_path = '') {
	const path_map = {};

	for(const [key, value] of Object.entries(source_object)) {
		const next_path = parent_path ? `${parent_path}.${key}` : key;

		if(is_plain_object(value)) {
			const nested_keys = Object.keys(value);

			if(nested_keys.length === 0) {
				path_map[next_path] = {};
				continue;
			}

			Object.assign(path_map, flatten_update_paths(value, next_path));
			continue;
		}

		path_map[next_path] = value;
	}

	return path_map;
}

/**
 * Strip the tracked root segment from one tracker-emitted path.
 *
 * @param {string} path_name
 * @param {string} data_column
 * @returns {string}
 */
function strip_tracked_root(path_name, data_column) {
	if(path_name === data_column) {
		return '';
	}

	const path_prefix = `${data_column}.`;

	if(path_name.startsWith(path_prefix)) {
		return path_name.substring(path_prefix.length);
	}

	return path_name;
}

export {
	exec_update_one
};
