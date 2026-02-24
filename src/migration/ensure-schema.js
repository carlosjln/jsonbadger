import ensure_index from '#src/migration/ensure-index.js';
import resolve_schema_indexes from '#src/migration/schema-indexes-resolver.js';
import ensure_table from '#src/migration/ensure-table.js';

export default async function ensure_schema(table_name, data_column, collection_schema, id_strategy) {
	await ensure_table(table_name, data_column, id_strategy);

	const schema_indexes = resolve_schema_indexes(collection_schema);
	let index_position = 0;

	while(index_position < schema_indexes.length) {
		const index_definition = schema_indexes[index_position];
		await ensure_index(table_name, index_definition.index_spec, data_column, index_definition.index_options);
		index_position += 1;
	}
}
