import {is_array} from '#src/utils/array.js';

function resolve_schema_indexes(collection_schema) {
	const schema_indexes = collection_schema?.get_indexes?.();
	return is_array(schema_indexes) ? schema_indexes : [];
}

export default resolve_schema_indexes;
