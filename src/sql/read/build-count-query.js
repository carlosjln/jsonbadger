/*
 * MODULE RESPONSIBILITY
 * Build SQL text and parameters for count read queries.
 */
function build_count_query(query_context) {
	return {
		sql_text: `SELECT COUNT(*)::int AS total_count FROM ${query_context.table_identifier} WHERE ${query_context.where_result.sql}`,
		sql_params: query_context.where_result.params
	};
}

export default build_count_query;
