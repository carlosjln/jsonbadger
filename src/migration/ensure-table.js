/*
 * MODULE RESPONSIBILITY
 * Ensure the model backing table exists with the expected base columns.
 */
import {assert_identifier, quote_identifier} from '#src/utils/assert.js';
import run from '#src/sql/run.js';

async function ensure_table(context) {
	const {
		table_name,
		data_column,
		identity_runtime,
		connection
	} = context;

	assert_identifier(table_name, 'table_name');
	assert_identifier(data_column, 'data_column');

	const table_identifier = quote_identifier(table_name);
	const data_identifier = quote_identifier(data_column);
	const id_column_sql = identity_runtime.column_sql;
	const sql_text =
		`CREATE TABLE IF NOT EXISTS ` +
		`${table_identifier} (${id_column_sql}, ${data_identifier} JSONB NOT NULL, ` +
		`created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), ` +
		`updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` +
		`);`;

	await run(sql_text, [], connection);
}

export default ensure_table;
