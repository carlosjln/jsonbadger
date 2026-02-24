/*
Assumptions and trade-offs:
- Type-key rules are strict: explicit declarations win when `type` is a supported type reference.
- Plain-object `of` definitions for Array/Map are normalized to Mixed in this phase.
*/
import {default_field_type_registry} from '#src/field-types/registry.js';
import {is_array, is_not_array} from '#src/utils/array.js';

export default function field_definition_parser(schema_definition, registry_instance) {
	const parse_state = {
		field_types: Object.create(null),
		object_paths: new Set()
	};
	const schema_root = schema_definition || {};
	const field_registry = registry_instance || default_field_type_registry;

	parse_schema_object(schema_root, '', field_registry, parse_state);

	return {
		field_types: parse_state.field_types,
		object_paths: parse_state.object_paths
	};
}

function parse_schema_object(schema_object, parent_path, field_registry, parse_state) {
	if(!is_plain_object(schema_object)) {
		throw new Error('Schema definition must be an object');
	}

	const schema_entries = Object.entries(schema_object);
	let entry_index = 0;

	while(entry_index < schema_entries.length) {
		const schema_entry = schema_entries[entry_index];
		const path_segment = schema_entry[0];
		const field_definition = schema_entry[1];
		const path_value = parent_path ? parent_path + '.' + path_segment : path_segment;
		const parsed_field = parse_field_definition(path_value, field_definition, field_registry);

		if(parsed_field.kind === 'field_type') {
			parse_state.field_types[path_value] = parsed_field.field_type;
			entry_index += 1;
			continue;
		}

		parse_state.object_paths.add(path_value);
		parse_schema_object(parsed_field.nested_schema, path_value, field_registry, parse_state);
		entry_index += 1;
	}
}

function parse_field_definition(path_value, field_definition, field_registry) {
	if(is_array(field_definition)) {
		return {
			kind: 'field_type',
			field_type: create_array_field_type(path_value, field_definition, {}, field_registry)
		};
	}

	if(field_registry.has_field_type(field_definition)) {
		return {
			kind: 'field_type',
			field_type: field_registry.create_field_type(path_value, field_definition, {})
		};
	}

	if(is_plain_object(field_definition)) {
		const definition_keys = Object.keys(field_definition);

		if(definition_keys.length === 0) {
			return {
				kind: 'field_type',
				field_type: field_registry.create_field_type(path_value, 'Mixed', {})
			};
		}

		if(should_use_explicit_type(field_definition, field_registry)) {
			return {
				kind: 'field_type',
				field_type: create_explicit_field_type(path_value, field_definition, field_registry)
			};
		}

		return {
			kind: 'nested',
			nested_schema: field_definition
		};
	}

	throw new Error('Invalid field definition at path "' + path_value + '"');
}

function should_use_explicit_type(field_definition, field_registry) {
	if(!Object.prototype.hasOwnProperty.call(field_definition, 'type')) {
		return false;
	}

	const type_key = field_definition.type;

	if(is_array(type_key)) {
		return true;
	}

	return field_registry.has_field_type(type_key);
}

function create_explicit_field_type(path_value, field_definition, field_registry) {
	const type_key = field_definition.type;
	const of_definition = field_definition.of;
	const field_options = Object.assign({}, field_definition);

	// Remove schema-definition syntax keys after extracting them.
	// Runtime FieldType instances should receive internal option keys (for example, `of_field_type`),
	// not parser syntax keys like `type` or `of`.
	delete field_options.type;
	delete field_options.of;

	if(is_array(type_key)) {
		return create_array_field_type(path_value, type_key, field_options, field_registry);
	}

	const type_name = field_registry.resolve_field_type_name(type_key);

	if(!type_name) {
		throw new Error('Unsupported field type at path "' + path_value + '"');
	}

	if(type_name === 'Array') {
		const explicit_array_definition = of_definition !== undefined ? [of_definition] : [];
		return create_array_field_type(path_value, explicit_array_definition, field_options, field_registry);
	}

	if(type_name === 'Map') {
		field_options.of_field_type = create_of_field_type(path_value, of_definition, field_registry);
		return field_registry.create_field_type(path_value, type_name, field_options);
	}

	if(type_name === 'Union') {
		field_options.of_field_types = create_union_field_types(path_value, of_definition, field_registry);
		return field_registry.create_field_type(path_value, type_name, field_options);
	}

	return field_registry.create_field_type(path_value, type_name, field_options);
}

function create_array_field_type(path_value, array_definition, field_options, field_registry) {
	if(array_definition.length > 1) {
		throw new Error('Array type definition at path "' + path_value + '" must contain at most one item type');
	}

	const array_options = Object.assign({}, field_options || {});
	const item_definition = array_definition.length === 1 ? array_definition[0] : undefined;

	array_options.of_field_type = create_of_field_type(path_value, item_definition, field_registry);
	return field_registry.create_field_type(path_value, 'Array', array_options);
}

function create_union_field_types(path_value, union_of_definition, field_registry) {
	if(is_not_array(union_of_definition) || union_of_definition.length === 0) {
		throw new Error('Union type definition at path "' + path_value + '" must define a non-empty "of" array');
	}

	const union_field_types = [];
	let type_index = 0;

	while(type_index < union_of_definition.length) {
		union_field_types.push(create_union_candidate_field_type(path_value, union_of_definition[type_index], field_registry));
		type_index += 1;
	}

	return union_field_types;
}

function create_union_candidate_field_type(path_value, union_definition, field_registry) {
	if(is_array(union_definition)) {
		return create_array_field_type(path_value, union_definition, {}, field_registry);
	}

	if(field_registry.has_field_type(union_definition)) {
		return field_registry.create_field_type(path_value, union_definition, {});
	}

	if(is_plain_object(union_definition) && should_use_explicit_type(union_definition, field_registry)) {
		return create_explicit_field_type(path_value, union_definition, field_registry);
	}

	throw new Error('Unsupported union type at path "' + path_value + '"');
}

function create_of_field_type(path_value, of_definition, field_registry) {
	const item_path = path_value + '.$';

	if(of_definition === undefined) {
		return field_registry.create_field_type(item_path, 'Mixed', {});
	}

	if(is_array(of_definition)) {
		return create_array_field_type(item_path, of_definition, {}, field_registry);
	}

	if(field_registry.has_field_type(of_definition)) {
		return field_registry.create_field_type(item_path, of_definition, {});
	}

	if(is_plain_object(of_definition)) {
		if(should_use_explicit_type(of_definition, field_registry)) {
			return create_explicit_field_type(item_path, of_definition, field_registry);
		}

		return field_registry.create_field_type(item_path, 'Mixed', {});
	}

	throw new Error('Unsupported "of" definition at path "' + path_value + '"');
}

function is_plain_object(value) {
	return value !== null && typeof value === 'object' && is_not_array(value);
}
