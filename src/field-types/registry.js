/*
Registry contract:
- The default registry is process-level. It owns built-ins and user-registered field types.
- Aliases resolve to one canonical type name before instantiation.
- Unknown aliases fail fast. The registry does not guess or silently fallback.
*/
import {get_foundational_field_types} from '#src/field-types/builtins/index.js';
import {deep_clone} from '#src/utils/object.js';

function FieldTypeRegistry() {
	this.type_constructors_by_name = Object.create(null);
	this.type_name_by_alias = new Map();
	this.register_foundational_types();
}

/**
 * Registers the foundational field-type entries in the default registry format.
 *
 * @returns {void}
 */
FieldTypeRegistry.prototype.register_foundational_types = function () {
	const foundational_type_entries = Object.entries(get_foundational_field_types());
	let entry_index = 0;

	while(entry_index < foundational_type_entries.length) {
		const type_entry = foundational_type_entries[entry_index];
		const type_name = type_entry[0];
		const type_definition = type_entry[1];

		this.register(type_name, type_definition.constructor, type_definition.aliases);
		entry_index += 1;
	}
};

/**
 * Registers a field type and its lookup aliases.
 *
 * @param {string} type_name Canonical field-type name.
 * @param {Function} type_constructor Field-type constructor.
 * @param {Array<*>} aliases Optional alias list used for lookup resolution.
 * @returns {void}
 */
FieldTypeRegistry.prototype.register = function (type_name, type_constructor, aliases) {
	const resolved_name = String(type_name);
	const resolved_aliases = Array.isArray(aliases) ? aliases : [];

	this.type_constructors_by_name[resolved_name] = type_constructor;
	this.type_name_by_alias.set(resolved_name, resolved_name);

	register_aliases(this.type_name_by_alias, resolved_name, resolved_aliases);
};

/**
 * Resolves an alias or canonical name to the registered field-type name.
 *
 * @param {*} type_alias Alias or canonical field-type reference.
 * @returns {string|null}
 */
FieldTypeRegistry.prototype.resolve = function (type_alias) {
	if(this.type_name_by_alias.has(type_alias)) {
		return this.type_name_by_alias.get(type_alias);
	}

	if(typeof type_alias === 'string' && this.type_constructors_by_name[type_alias]) {
		return type_alias;
	}

	return null;
};

/**
 * Checks whether a field type exists in the registry.
 *
 * @param {*} type_alias Alias or canonical field-type reference.
 * @returns {boolean}
 */
FieldTypeRegistry.prototype.has_field_type = function (type_alias) {
	const type_name = this.resolve(type_alias);
	return type_name !== null;
};

/**
 * Creates a field-type instance for a schema path.
 *
 * @param {string} path_value Schema path.
 * @param {*} type_alias Alias or canonical field-type reference.
 * @param {object} options Field options.
 * @returns {object}
 * @throws {Error} When the field type is unsupported.
 */
FieldTypeRegistry.prototype.create = function (path_value, type_alias, options) {
	const type_name = this.resolve(type_alias);

	if(!type_name) {
		throw new Error('Unsupported field type at path "' + path_value + '"');
	}

	const type_constructor = this.type_constructors_by_name[type_name];
	const field_options = create_field_options(options);

	return new type_constructor(path_value, field_options, this);
};

/**
 * Stores aliases in the lookup map for a canonical field-type name.
 *
 * @param {Map<*, string>} type_name_by_alias Alias-to-name lookup map.
 * @param {string} resolved_name Canonical field-type name.
 * @param {Array<*>} resolved_aliases Normalized alias list.
 * @returns {void}
 */
function register_aliases(type_name_by_alias, resolved_name, resolved_aliases) {
	let alias_index = 0;

	while(alias_index < resolved_aliases.length) {
		type_name_by_alias.set(resolved_aliases[alias_index], resolved_name);
		alias_index += 1;
	}
}

/**
 * Clones plain field options without flattening live FieldType instances.
 *
 * @param {object} options Field options.
 * @returns {object}
 */
function create_field_options(options) {
	// Bugfix note:
	// Parser-generated options can include nested FieldType instances (`of_field_type`, `of_field_types`).
	// Those must keep their prototype methods intact, so the clone helper preserves custom instances by reference.
	return deep_clone(options || {});
}

const default_field_type_registry = new FieldTypeRegistry();

function register(type_name, type_constructor, aliases) {
	default_field_type_registry.register(type_name, type_constructor, aliases);
}

function resolve(type_alias) {
	return default_field_type_registry.resolve(type_alias);
}

function create(path_value, type_alias, options) {
	return default_field_type_registry.create(path_value, type_alias, options);
}

export {create, default_field_type_registry, FieldTypeRegistry, register, resolve};
