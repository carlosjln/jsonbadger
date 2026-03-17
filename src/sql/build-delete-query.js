/**
 * Build one compiled delete query payload.
 *
 * @param {object} query_context
 * @param {string} query_context.table_identifier
 * @param {string} query_context.data_identifier
 * @param {object} query_context.where_result
 * @param {string} query_context.where_result.sql
 * @param {Array<*>} query_context.where_result.params
 * @returns {{sql_text: string, sql_params: Array<*>}}
 */
function build_delete_query(query_context) {
	const sql_text =
		`WITH target_row AS (SELECT id FROM ${query_context.table_identifier} WHERE ${query_context.where_result.sql} LIMIT 1) ` +
		`DELETE FROM ${query_context.table_identifier} AS target_table ` +
		`USING target_row ` +
		`WHERE target_table.id = target_row.id ` +
		`RETURNING target_table.id::text AS id, ` +
		`target_table.${query_context.data_identifier} AS data, ` +
		`target_table.created_at AS created_at, ` +
		`target_table.updated_at AS updated_at`;

	return {
		sql_text,
		sql_params: query_context.where_result.params
	};
}

export default build_delete_query;
