/*
 * MODULE RESPONSIBILITY
 * Bridge model-layer update input into the SQL update context.
 */
import sql from '#src/sql/index.js';
import where_compiler from '#src/sql/read/where/index.js';
import {create_parameter_state} from '#src/sql/parameter-binder.js';

import {JsonbOps} from '#src/sql/jsonb-ops.js';
import {is_array} from '#src/utils/array.js';
import {quote_identifier} from '#src/utils/assert.js';
import {timestamp_fields} from '#src/model/factory/constants.js';
import {is_not_object, is_object} from '#src/utils/value.js';

/**
 * Execute Model.update_one() by coordinating syntax parsing and SQL generation.
 */
async function exec_update_one(model, query_filter, update_definition) {
	if(is_not_object(update_definition) || Object.keys(update_definition).length === 0) {
		return null;
	}

	const model_options = model.options;
	const data_column = model_options.data_column;

	// 1. Domain Split: Separate row columns from JSON payload
	const {timestamp_set, payload} = normalize_update_definition(update_definition, data_column);

	// 2. Syntax Pass: Build the JsonbOps instance
	const data_identifier = quote_identifier(data_column);
	const jsonb_ops = JsonbOps.from(payload, {
		column_name: data_identifier,
		coalesce: true
	});

	// 3. State Pass: Setup binders and filters
	const where_result = where_compiler(query_filter, {
		schema: model.schema,
		data_column,
		id_strategy: model.schema.id_strategy
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

	// 4. Execution
	const update_query = sql.build_update_query(query_context);
	const query_result = await sql.run(update_query.sql_text, update_query.sql_params, model.connection);
	const row = query_result.rows.length ? query_result.rows[0] : null;

	if(row) {
		return model.hydrate(row);
	}

	return null;
}

// TODO: refactor this into an explicit payload router once one document instance can target several JSONB slugs.
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

	if(is_object(payload.$set)) {
		payload.$set = pull_timestamp_fields(payload.$set, timestamp_set);
	}

	if(is_object(payload.set)) {
		const tracked_set = pull_timestamp_fields(payload.set, timestamp_set);
		const set_payload = is_object(payload.$set) ? payload.$set : {};

		delete payload.set;
		payload.$set = set_payload;

		for(const [path_name, value] of Object.entries(tracked_set)) {
			const next_path = strip_tracked_root(path_name, data_column);

			if(next_path === '') {
				continue;
			}

			set_payload[next_path] = value;
		}
	}

	if(is_array(payload.unset)) {
		const tracked_unset = payload.unset;
		const unset_payload = is_array(payload.$unset) ? payload.$unset : [];

		delete payload.unset;
		payload.$unset = unset_payload;

		for(const path_name of tracked_unset) {
			const next_path = strip_tracked_root(path_name, data_column);

			if(next_path === '') {
				payload.$replace_roots = {};
				continue;
			}

			unset_payload.push(next_path);
		}
	}

	if(is_object(payload.replace_roots)) {
		const next_root_payload = payload.replace_roots[data_column];

		delete payload.replace_roots;

		if(next_root_payload !== undefined) {
			payload.$replace_roots = next_root_payload;
		}
	}

	return {timestamp_set, payload};
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
		if(Object.prototype.hasOwnProperty.call(next_object, key)) {
			timestamp_set[key] = next_object[key];
			delete next_object[key];
		}
	}

	return next_object;
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
