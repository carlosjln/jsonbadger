import Schema from '#src/schema/schema.js';
import model from '#src/model/factory/index.js';

function create_model(schema_definition = {}, schema_options = {}, model_options = {}, connection = undefined) {
	const schema_instance = new Schema(schema_definition, schema_options);

	return model(
		undefined,
		schema_instance,
		Object.assign({table_name: 'users'}, model_options),
		connection
	);
}

function create_payload_model(schema_definition, slugs = []) {
	return create_model(schema_definition, {
		default_slug: 'payload',
		slugs
	});
}

function create_stubbed_model(schema_options = {}) {
	return create_model({}, schema_options, {table_name: 'users'}, undefined);
}

export {
	create_model,
	create_payload_model,
	create_stubbed_model
};
