import sql_runner from '#src/sql/sql-runner.js';
import where_compiler from '#src/query/where-compiler/index.js';
import {quote_identifier} from '#src/utils/assert.js';

/**
 * Compiles and executes Model.delete_one() for a model constructor.
 *
 * @param {Function} model Model constructor.
 * @param {object|undefined} query_filter Query filter.
 * @returns {Promise<object|null>}
 */
async function compile_delete_one(model, query_filter) {
	const schema = model.schema;
	const id_strategy = model.id_strategy;

	const model_options = model.$options;
	const data_column = model_options.data_column;
	const table_name = model_options.table_name;

	const table_identifier = quote_identifier(table_name);
	const data_identifier = quote_identifier(data_column);
	const where_result = where_compiler(query_filter, {schema, data_column, id_strategy});

	const query_context = {
		model,
		table_identifier,
		data_identifier,
		where_result
	};

	const row = await exec_delete_query(query_context);

	if(row) {
		return model.hydrate(row);
	}

	return null;
}

async function exec_delete_query(query_context) {
	const sql_text =
		'WITH target_row AS (' + 'SELECT id FROM ' + query_context.table_identifier + ' WHERE ' + query_context.where_result.sql + ' LIMIT 1' + ') ' +
		'DELETE FROM ' + query_context.table_identifier + ' AS target_table ' +
		'USING target_row ' +
		'WHERE target_table.id = target_row.id ' +
		'RETURNING target_table.id::text AS id, ' +
		'target_table.' + query_context.data_identifier + ' AS data, ' +
		'target_table.created_at AS created_at, ' +
		'target_table.updated_at AS updated_at';

	const query_result = await sql_runner(sql_text, query_context.where_result.params, query_context.model.connection);
	const rows = query_result.rows;

	if(rows.length) {
		return rows[0];
	}

	return null;
}

export {
	compile_delete_one
};
