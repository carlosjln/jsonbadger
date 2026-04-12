import Schema from '#src/schema/schema.js';

/**
 * Create one schema instance already bound to a query-capable runtime.
 *
 * @param {object} schema_definition
 * @returns {Schema}
 */
function create_bound_schema(schema_definition) {
	const schema_instance = new Schema(schema_definition);

	schema_instance.$bind_connection({
		server_capabilities: {
			supports_jsonpath: true
		}
	});

	return schema_instance;
}

export {
	create_bound_schema
};
