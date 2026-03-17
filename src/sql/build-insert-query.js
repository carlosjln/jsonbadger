import {jsonb_stringify} from '#src/utils/json.js';

/**
 * Build one insert query payload for a model row insert.
 *
 * @param {object} query_context
 * @param {string} query_context.table_identifier
 * @param {string} query_context.data_identifier
 * @param {object} query_context.payload
 * @param {object} query_context.base_fields
 * @returns {object}
 */
function build_insert_query(query_context) {
	const sql_columns = [query_context.data_identifier];
	const sql_params = [jsonb_stringify(query_context.payload)];
	const sql_values = ['$1::jsonb'];

	if(query_context.base_fields.id !== undefined && query_context.base_fields.id !== null) {
		sql_columns.push('id');
		sql_params.push(String(query_context.base_fields.id));
		sql_values.push('$' + sql_params.length + '::uuid');
	}

	for(const key of ['created_at', 'updated_at']) {
		sql_columns.push(key);
		sql_params.push(query_context.base_fields[key]);
		sql_values.push('$' + sql_params.length + '::timestamptz');
	}

	return {
		sql_text:
			`INSERT INTO ${query_context.table_identifier} (${sql_columns.join(', ')}) VALUES (${sql_values.join(', ')}) ` +
			`RETURNING id::text AS id, ${query_context.data_identifier} AS data, created_at AS created_at, updated_at AS updated_at`,
		sql_params
	};
}

export default build_insert_query;
