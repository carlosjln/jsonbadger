import where_compiler from '#src/query/where-compiler.js';

import sql_runner from '#src/sql/sql-runner.js';

import {quote_identifier} from '#src/utils/assert.js';

import {is_missing_relation_query_error} from '#src/model/factory/update-helpers.js';

/**
 * Compiles and executes Model.delete_one() for a model constructor.
 *
 * @param {Function} Model Model constructor.
 * @param {object} schema_instance Schema instance.
 * @param {object} model_options Model options.
 * @param {object|undefined} query_filter Query filter.
 * @returns {Promise<object|null>}
 */
async function compile_delete_one(Model, schema_instance, model_options, query_filter) {
	const table_identifier = quote_identifier(model_options.table_name);
	const data_identifier = quote_identifier(model_options.data_column);
	const where_result = where_compiler(query_filter || {}, {
		data_column: model_options.data_column,
		schema: schema_instance,
		id_strategy: Model.resolve_id_strategy()
	});

	const sql_text =
		'WITH target_row AS (' + 'SELECT id FROM ' + table_identifier + ' WHERE ' + where_result.sql + ' LIMIT 1' + ') ' +
		'DELETE FROM ' + table_identifier + ' AS target_table ' +
		'USING target_row ' +
		'WHERE target_table.id = target_row.id ' +
		'RETURNING target_table.id::text AS id, ' +
		'target_table.' + data_identifier + ' AS data, ' +
		'target_table.created_at AS created_at, ' +
		'target_table.updated_at AS updated_at';

	let query_result;

	try {
		query_result = await sql_runner(sql_text, where_result.params, Model.connection);
	} catch(error) {
		if(is_missing_relation_query_error(error)) {
			return null;
		}

		throw error;
	}

	if(query_result.rows.length === 0) {
		return null;
	}

	return Model.create_document_from_row(query_result.rows[0]);
}

export {
	compile_delete_one
};
