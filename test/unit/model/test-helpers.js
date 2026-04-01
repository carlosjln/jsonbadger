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
	const default_slug = schema_options.default_slug ?? 'data';
	const extra_slugs = schema_options.slugs ?? [];
	const schema_stub = {
		strict: true,
		validate(document) {
			return document;
		},
		conform(payload) {
			return payload;
		},
		get_default_slug() {
			return default_slug;
		},
		get_extra_slugs() {
			return [...extra_slugs];
		},
		get_slugs() {
			return [default_slug, ...extra_slugs];
		},
		aliases: Object.create(null),
		get_path() {
			return null;
		}
	};

	return model(undefined, schema_stub, {table_name: 'users'}, undefined);
}

export {
	create_model,
	create_payload_model,
	create_stubbed_model
};
