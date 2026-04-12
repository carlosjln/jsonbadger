import Schema from '#src/schema/schema.js';

/**
 * Create one schema instance already bound to a query-capable runtime.
 *
 * @param {object} [schema_definition]
 * @param {object} [schema_options]
 * @param {object} [server_capabilities]
 * @returns {Schema}
 */
function create_bound_schema(schema_definition = {}, schema_options = {}, server_capabilities = {}) {
	const schema_instance = new Schema(schema_definition, schema_options);

	schema_instance.$bind_connection({
		server_capabilities: {
			supports_jsonpath: true,
			supports_uuidv7: true,
			...server_capabilities
		}
	});

	return schema_instance;
}

export {
	create_bound_schema
};
