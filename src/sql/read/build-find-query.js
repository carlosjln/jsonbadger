/*
 * MODULE RESPONSIBILITY
 * Build SQL text and parameters for row-returning read queries.
 */
import limit_skip_compiler from '#src/sql/read/limit-skip.js';
import sort_compiler from '#src/sql/read/sort.js';

function build_find_query(query_context) {
	let sql_text =
		`SELECT id::text AS id, ${query_context.data_identifier} AS data, ` +
		`created_at AS created_at, ` +
		`updated_at AS updated_at ` +
		`FROM ${query_context.table_identifier} ` +
		`WHERE ${query_context.where_result.sql}`;

	sql_text += sort_compiler(query_context.sort, {data_column: query_context.data_column});
	sql_text += limit_skip_compiler(query_context.limit_count, query_context.skip_count);

	return {
		sql_text,
		sql_params: query_context.where_result.params
	};
}

export default build_find_query;
