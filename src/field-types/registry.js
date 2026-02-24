/*
Assumptions and trade-offs:
- A process-level default registry is used for built-ins and extension registration.
- Type resolution is explicit; unsupported references throw immediately.
*/
import {get_foundational_field_types} from '#src/field-types/builtins/index.js';

function FieldTypeRegistry() {
	this.type_constructors_by_name = Object.create(null);
	this.type_name_by_reference = new Map();
	this.register_foundational_types();
}

FieldTypeRegistry.prototype.register_foundational_types = function () {
	const foundational_type_entries = get_foundational_type_entries();
	let entry_index = 0;

	while(entry_index < foundational_type_entries.length) {
		const type_entry = foundational_type_entries[entry_index];
		const type_name = type_entry[0];
		const type_definition = type_entry[1];

		this.register_field_type(type_name, type_definition.constructor, type_definition.references);
		entry_index += 1;
	}
};

FieldTypeRegistry.prototype.register_field_type = function (type_name, type_constructor, references) {
	const resolved_name = resolve_type_name_value(type_name);
	const resolved_references = resolve_reference_list(references);

	this.type_constructors_by_name[resolved_name] = type_constructor;
	this.type_name_by_reference.set(resolved_name, resolved_name);
	register_reference_aliases(this.type_name_by_reference, resolved_name, resolved_references);
};

FieldTypeRegistry.prototype.resolve_field_type_name = function (type_reference) {
	return resolve_field_type_name_value(
		this.type_name_by_reference,
		this.type_constructors_by_name,
		type_reference
	);
};

FieldTypeRegistry.prototype.has_field_type = function (type_reference) {
	const type_name = this.resolve_field_type_name(type_reference);
	return type_name !== null;
};

FieldTypeRegistry.prototype.create_field_type = function (path_value, type_reference, options) {
	const type_name = this.resolve_field_type_name(type_reference);
	assert_supported_type_name(path_value, type_name);

	const type_constructor = this.type_constructors_by_name[type_name];
	const field_options = create_field_options(options);

	return new type_constructor(path_value, field_options, this);
};

function get_foundational_type_entries() {
	const foundational_types = get_foundational_field_types();
	return Object.entries(foundational_types);
}

function resolve_type_name_value(type_name) {
	return String(type_name);
}

function resolve_reference_list(references) {
	if(Array.isArray(references)) {
		return references;
	}

	return [];
}

function register_reference_aliases(type_name_by_reference, resolved_name, resolved_references) {
	let reference_index = 0;

	while(reference_index < resolved_references.length) {
		type_name_by_reference.set(resolved_references[reference_index], resolved_name);
		reference_index += 1;
	}
}

function resolve_field_type_name_value(type_name_by_reference, type_constructors_by_name, type_reference) {
	if(type_name_by_reference.has(type_reference)) {
		return type_name_by_reference.get(type_reference);
	}

	if(typeof type_reference === 'string' && type_constructors_by_name[type_reference]) {
		return type_reference;
	}

	return null;
}

function create_field_options(options) {
	return Object.assign({}, options || {});
}

function assert_supported_type_name(path_value, type_name) {
	if(!type_name) {
		throw new Error('Unsupported field type at path "' + path_value + '"');
	}
}

const default_field_type_registry = new FieldTypeRegistry();

function register_field_type(type_name, type_constructor, references) {
	default_field_type_registry.register_field_type(type_name, type_constructor, references);
}

function resolve_field_type(type_reference) {
	return default_field_type_registry.resolve_field_type_name(type_reference);
}

function create_field_type(path_value, type_reference, options) {
	return default_field_type_registry.create_field_type(path_value, type_reference, options);
}

export {create_field_type, default_field_type_registry, FieldTypeRegistry, register_field_type, resolve_field_type};
