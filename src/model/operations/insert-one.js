/*
 * MODULE RESPONSIBILITY
 * Execute the model-layer insert-one persistence path.
 */
import sql from '#src/sql/index.js';
import {quote_identifier} from '#src/utils/assert.js';

/**
 * Execute one insert against prepared SQL-facing insert state.
 *
 * @param {Function} model Model constructor.
 * @param {object} data Prepared insert state.
 * @param {object} data.payload JSONB payload for the data column.
 * @param {object} data.base_fields Row-level fields to persist outside the data column.
 * @returns {Promise<object|null>}
 */
async function exec_insert_one(model, data) {
	const model_options = model.options;
	const table_name = model_options.table_name;
	const data_column = model_options.data_column;
	const table_identifier = quote_identifier(table_name);
	const data_identifier = quote_identifier(data_column);
	const payload = data.payload;
	const base_fields = data.base_fields;

	const insert_query = sql.build_insert_query({table_identifier, data_identifier, payload, base_fields});
	const query_result = await sql.run(insert_query.sql_text, insert_query.sql_params, model.connection);
	const saved_row = query_result.rows[0];

	return saved_row;
}

export {
	exec_insert_one
};
