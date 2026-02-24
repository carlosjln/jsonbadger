/*
- Assumptions and trade-offs:
- Introspection resolves declared FieldType paths plus nested object path metadata.
*/
export function create_path_introspection(parsed_schema) {
	const parsed_value = parsed_schema ?? {};
	const field_types = resolve_field_types_map(parsed_value);
	const object_paths = resolve_object_paths(parsed_value);

	return {
		field_types,
		object_paths
	};
}

export function get_path_field_type(path_introspection, path_name) {
	if(!path_introspection || !path_name) {
		return null;
	}

	const field_types = resolve_field_types_map(path_introspection);
	return field_types[path_name] ?? null;
}

export function get_path_type(path_introspection, path_name) {
	const field_type = get_path_field_type(path_introspection, path_name);

	if(field_type) {
		return field_type.instance;
	}

	const object_paths = resolve_object_paths(path_introspection);

	if(object_paths.has(path_name)) {
		return 'object';
	}

	return null;
}

export function is_array_root(path_introspection, path_name) {
	if(!path_introspection || !path_name) {
		return false;
	}

	const root_path = String(path_name).split('.')[0];
	const root_field_type = get_path_field_type(path_introspection, root_path);

	if(!root_field_type) {
		return false;
	}

	return root_field_type.instance === 'Array';
}

function resolve_field_types_map(value) {
	if(!value || typeof value !== 'object') {
		return Object.create(null);
	}

	const field_types = value.field_types;

	if(field_types && typeof field_types === 'object') {
		return field_types;
	}

	return Object.create(null);
}

function resolve_object_paths(value) {
	if(!value) {
		return new Set();
	}

	const object_paths = value.object_paths;

	if(object_paths instanceof Set) {
		return object_paths;
	}

	return new Set();
}
