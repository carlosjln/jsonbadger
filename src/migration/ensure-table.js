import {assert_identifier, quote_identifier} from '#src/utils/assert.js';
import IdStrategies, {assert_id_strategy} from '#src/constants/id-strategies.js';
import sql_run from '#src/sql/sql-run.js';

const ID_COLUMN_SQL_BY_STRATEGY = {
	[IdStrategies.bigserial]: 'id BIGSERIAL PRIMARY KEY',
	[IdStrategies.uuidv7]: 'id UUID PRIMARY KEY DEFAULT uuidv7()'
};

async function ensure_table(context) {
	const {
		table_name,
		data_column,
		id_strategy,
		connection
	} = context;

	assert_identifier(table_name, 'table_name');
	assert_identifier(data_column, 'data_column');
	assert_id_strategy(id_strategy);

	const final_id_strategy = id_strategy;
	const table_identifier = quote_identifier(table_name);
	const data_identifier = quote_identifier(data_column);
	const id_column_sql = resolve_id_column_sql(final_id_strategy);
	const sql_text =
		`CREATE TABLE IF NOT EXISTS ` +
		`${table_identifier} (${id_column_sql}, ${data_identifier} JSONB NOT NULL, ` +
		`created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), ` +
		`updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` +
		`);`;

	await sql_run(sql_text, [], connection);
}

function resolve_id_column_sql(id_strategy) {
	return ID_COLUMN_SQL_BY_STRATEGY[id_strategy];
}

export default ensure_table;
