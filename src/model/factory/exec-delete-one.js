import sql from '#src/sql/index.js';
import where_compiler from '#src/query/where-compiler/index.js';
import {quote_identifier} from '#src/utils/assert.js';

/**
 * Execute Model.delete_one() for a model constructor.
 *
 * @param {Function} model Model constructor.
 * @param {object|undefined} query_filter Query filter.
 * @returns {Promise<object|null>}
 */
async function exec_delete_one(model, query_filter) {
	const schema = model.schema;
	const id_strategy = schema.id_strategy;

	const model_options = model.options;
	const data_column = model_options.data_column;
	const table_name = model_options.table_name;

	const table_identifier = quote_identifier(table_name);
	const data_identifier = quote_identifier(data_column);
	const where_result = where_compiler(query_filter, {schema, data_column, id_strategy});
	const query_context = {table_identifier, data_identifier, where_result};

	const delete_query = sql.build_delete_query(query_context);
	const query_result = await sql.run(delete_query.sql_text, delete_query.sql_params, model.connection);
	const rows = query_result.rows;
	const row = rows.length ? rows[0] : null;

	if(row) {
		return model.hydrate(row);
	}

	return null;
}

export {
	exec_delete_one
};
