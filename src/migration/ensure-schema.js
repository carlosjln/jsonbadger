import ensure_index from '#src/migration/ensure-index.js';
import resolve_schema_indexes from '#src/migration/schema-indexes-resolver.js';
import ensure_table from '#src/migration/ensure-table.js';

// TODO: should receive a single object param
async function ensure_schema(table_name, data_column, collection_schema, id_strategy, connection) {
	if(connection) {
		await ensure_table(table_name, data_column, id_strategy, connection);
	} else {
		await ensure_table(table_name, data_column, id_strategy);
	}

	const schema_indexes = resolve_schema_indexes(collection_schema);
	let index_position = 0;

	while(index_position < schema_indexes.length) {
		const index_definition = schema_indexes[index_position];
		if(connection) {
			await ensure_index(table_name, index_definition, data_column, connection);
		} else {
			await ensure_index(table_name, index_definition, data_column);
		}
		index_position += 1;
	}
}

export default ensure_schema;
