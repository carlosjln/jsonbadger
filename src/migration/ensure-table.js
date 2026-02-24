import {assert_identifier, quote_identifier} from '#src/utils/assert.js';
import IdStrategies, {assert_valid_id_strategy} from '#src/constants/id-strategies.js';
import sql_runner from '#src/sql/sql-runner.js';

const ID_COLUMN_SQL_BY_STRATEGY = {
	[IdStrategies.bigserial]: 'id BIGSERIAL PRIMARY KEY',
	[IdStrategies.uuidv7]: 'id UUID PRIMARY KEY DEFAULT uuidv7()'
};

export default async function ensure_table(table_name, data_column, id_strategy) {
	assert_identifier(table_name, 'table_name');
	assert_identifier(data_column, 'data_column');
	assert_valid_id_strategy(id_strategy);

	const final_id_strategy = id_strategy;
	const table_identifier = quote_identifier(table_name);
	const data_identifier = quote_identifier(data_column);
	const id_column_sql = resolve_id_column_sql(final_id_strategy);
	const sql_text =
		'CREATE TABLE IF NOT EXISTS ' + table_identifier + ' (' +
		id_column_sql + ', ' + data_identifier + ' JSONB NOT NULL, ' +
		'created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), ' +
		'updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()' +
		');';

	await sql_runner(sql_text, []);
}

function resolve_id_column_sql(id_strategy) {
	return ID_COLUMN_SQL_BY_STRATEGY[id_strategy];
}
