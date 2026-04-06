import defaults from '#src/constants/defaults.js';
import IdStrategies from '#src/constants/id-strategies.js';
import {assert_id_strategy} from '#src/constants/id-strategies.js';

import ValidationError from '#src/errors/validation-error.js';

import {default_field_type_registry} from '#src/field-types/registry.js';

import {create_path_validator, prepare_schema_state} from '#src/schema/schema-compiler.js';
import {get_path_type as resolve_path_type, is_array_root as resolve_is_array_root} from '#src/schema/path-introspection.js';

import {assert_condition, assert_identifier, assert_path} from '#src/utils/assert.js';
import {is_array, is_not_array} from '#src/utils/array.js';
import {read_nested_path, write_nested_path} from '#src/utils/object-path.js';
import {deep_clone, has_own} from '#src/utils/object.js';
import {is_function, is_object, is_plain_object, is_string, is_uuid_v7, is_valid_timestamp} from '#src/utils/value.js';

const base_fields = Object.freeze({
	id: Object.freeze({type: 'Mixed'}),
	created_at: Object.freeze({type: Date}),
	updated_at: Object.freeze({type: Date})
});

const base_fields_keys = new Set(Object.keys(base_fields));

function Schema(schema_definition = {}, schema_options = {}) {
	const $schema = inject_base_fields(schema_definition);
	const $options = build_schema_options(schema_options);
	const {path_introspection, field_types} = prepare_schema_state($schema);

	this.$field_registry = default_field_type_registry;
	this.$path_introspection = path_introspection;
	this.$field_types = field_types;

	this.indexes = [];
	this.options = $options;
	this.strict = this.options.strict !== false;
	this.id_strategy = this.options.id_strategy;
	this.auto_index = this.options.auto_index;
	this.methods = Object.create(null);
	this.validators = Object.create(null);
	this.aliases = collect_aliases(field_types);
	this.$conform_tree = build_allowed_tree(field_types);

	assert_id_strategy(this.id_strategy);
	assert_condition(typeof this.auto_index === 'boolean', 'auto_index must be a boolean');

	this.configure_validators();
	this.register_field_indexes($schema);
}

// --- PROTOTYPE: LIFECYCLE ---

/**
 * Configure document-slice validators for the default slug and registered root slugs.
 *
 * @returns {Schema}
 */
Schema.prototype.configure_validators = function () {
	const default_slug = this.get_default_slug();
	const registered_slug_keys = this.get_extra_slugs();
	const id_strategy = this.id_strategy;
	const validators = Object.create(null);

	// Root document validator
	validators.base_fields = (document) => {
		return validate_base_field_values(document, id_strategy);
	};

	// Get all definitions in one pass
	const slug_definitions = extract_slug_definitions(this.$field_types, default_slug, registered_slug_keys);

	// Wire up the validators dynamically
	for(const [slug_key, field_types] of Object.entries(slug_definitions)) {
		const validate_slice = create_path_validator(field_types);

		validators[slug_key] = (document) => {
			const slice = (is_plain_object(document) && has_own(document, slug_key)) ? document[slug_key] : {};
			return validate_slice(slice);
		};
	}

	this.validators = validators;
	return this;
};

Schema.prototype.register_field_indexes = function (schema_definition) {
	const field_defined_indexes = this.collect_field_defined_indexes(schema_definition);

	for(const index_definition of field_defined_indexes) {
		this.create_index(index_definition);
	}

	return this;
};

Schema.prototype.collect_field_defined_indexes = function (schema_definition) {
	const index_definitions = [];
	walk_schema_for_indexes(schema_definition, '', this.$field_registry, index_definitions);
	return index_definitions;
};


// --- PROTOTYPE: PRIMARY PUBLIC ---

/**
 * Validate one full document envelope across base fields and configured slug slices.
 *
 * @param {object} document
 * @returns {{valid: boolean, errors: object[]|null}}
 * @throws {ValidationError}
 */
Schema.prototype.validate = function (document) {
	const error_details = [];

	for(const run_validator of Object.values(this.validators)) {
		const validation_result = run_validator(document);

		if(validation_result.valid === false && is_array(validation_result.errors)) {
			error_details.push(...validation_result.errors);
		}
	}

	if(error_details.length > 0) {
		throw new ValidationError('Schema validation failed', error_details);
	}

	return {
		valid: true,
		errors: null
	};
};

/**
 * Validate root base fields directly against schema-level timestamp and id rules.
 *
 * @param {object} document
 * @returns {{valid: boolean, errors: object[]|null}}
 * @throws {ValidationError}
 */
Schema.prototype.validate_base_fields = function (document) {
	const validation_result = validate_base_field_values(document, this.id_strategy);

	if(!validation_result.valid) {
		throw new ValidationError('Schema validation failed', validation_result.errors);
	}

	return validation_result;
};

/**
 * Read the configured default slug name.
 *
 * @returns {string}
 */
Schema.prototype.get_default_slug = function () {
	return this.options.default_slug;
};

/**
 * Read the configured extra slug names.
 *
 * @returns {string[]}
 */
Schema.prototype.get_extra_slugs = function () {
	const slug_keys = this.options.slugs;

	if(is_not_array(slug_keys)) {
		return [];
	}

	return [...slug_keys];
};

/**
 * Read the full configured slug list, including the default slug.
 *
 * @returns {string[]}
 */
Schema.prototype.get_slugs = function () {
	const default_slug = this.get_default_slug();
	const extra_slugs = this.get_extra_slugs();

	return [default_slug, ...extra_slugs];
};

Schema.prototype.conform = function (payload) {
	if(!is_plain_object(payload)) {
		return;
	}

	walk_conform_tree(payload, this.$conform_tree);

	return payload;
};

Schema.prototype.cast = function (document) {
	if(!is_plain_object(document)) {
		return document;
	}

	const next_document = deep_clone(document);
	const default_slug = this.get_default_slug();
	const extra_slugs = new Set(this.get_extra_slugs());

	for(const [path_name, field_type] of Object.entries(this.$field_types)) {
		const path_segments = path_name.split('.');
		const root_key = path_segments[0];
		let target_root = next_document;
		let target_segments = path_segments;

		if(!base_fields_keys.has(root_key)) {
			if(extra_slugs.has(root_key)) {
				target_root = next_document[root_key];
				target_segments = path_segments.slice(1);
			} else {
				target_root = next_document[default_slug];
			}
		}

		const path_state = read_nested_path(target_root, target_segments);

		if(!path_state.exists) {
			continue;
		}

		let casted_value = path_state.value;
		const cast_context = {
			path: path_name,
			mode: 'cast'
		};

		if(is_function(field_type.apply_set)) {
			casted_value = field_type.apply_set(casted_value, cast_context);
		}

		if(is_function(field_type.cast)) {
			casted_value = field_type.cast(casted_value, cast_context);
		}

		write_nested_path(target_root, target_segments, casted_value);
	}

	return next_document;
};

Schema.prototype.method = function (method_name, method_implementation) {
	assert_identifier(method_name, 'method_name');
	assert_condition(is_function(method_implementation), 'method_implementation must be a function');
	assert_condition(has_own(this.methods, method_name) === false, 'Schema method "' + method_name + '" already exists');

	this.methods[method_name] = method_implementation;
	return this;
};

Schema.prototype.create_index = function (index_definition) {
	const normalized_index_definition = normalize_index_definition(index_definition);

	if(normalized_index_definition) {
		this.indexes.push(normalized_index_definition);
	}

	return this; // Allows chaining
};


// --- PROTOTYPE: SECONDARY / READ HELPERS ---

Schema.prototype.get_path = function (path_name) {
	if(has_own(this.$field_types, path_name)) {
		return this.$field_types[path_name];
	}

	return null;
};

Schema.prototype.get_path_type = function (path_name) {
	return resolve_path_type(this.$path_introspection, path_name);
};

Schema.prototype.is_array_root = function (path_name) {
	return resolve_is_array_root(this.$path_introspection, path_name);
};

Schema.prototype.get_indexes = function () {
	const cloned_indexes = [];

	for(const index_definition of this.indexes) {
		const cloned_definition = Object.assign({}, index_definition);

		if(is_object(index_definition.paths)) {
			cloned_definition.paths = Object.assign({}, index_definition.paths);
		}

		cloned_indexes.push(cloned_definition);
	}

	return cloned_indexes;
};

// --- LOCAL HELPER FUNCTIONS ---

function inject_base_fields(schema_def) {
	const next_schema = Object.assign({}, schema_def);

	for(const [field_name, field_config] of Object.entries(base_fields)) {
		if(!has_own(next_schema, field_name)) {
			next_schema[field_name] = Object.assign({}, field_config);
		}
	}

	return next_schema;
}

function build_allowed_tree(paths) {
	const allowed_tree = {};

	for(const path_name of Object.keys(paths)) {
		const path_segments = path_name.split('.');
		let current_branch = allowed_tree;

		const depth = path_segments.length - 1;
		const root_segment = path_segments[0];

		if(base_fields_keys.has(root_segment)) {
			continue;
		}

		for(let i = 0; i < depth; i++) {
			const segment_value = path_segments[i];

			if(!is_plain_object(current_branch[segment_value])) {
				current_branch[segment_value] = {};
			}

			current_branch = current_branch[segment_value];
		}

		current_branch[path_segments[depth]] = true;
	}

	return allowed_tree;
}

/**
 * Build a normalized alias registry from compiled schema paths.
 *
 * @param {object} paths
 * @returns {object}
 * @throws {Error}
 */
function collect_aliases(paths) {
	const aliases = Object.create(null);

	for(const [path_name, field_type] of Object.entries(paths)) {
		const alias_value = field_type?.options?.alias;

		if(!is_string(alias_value) || alias_value.length === 0) {
			continue;
		}

		assert_identifier(alias_value, 'alias');

		if(alias_value === path_name) {
			continue;
		}

		if(base_fields_keys.has(alias_value)) {
			throw new Error('Alias "' + alias_value + '" conflicts with reserved base field "' + alias_value + '"');
		}

		if(has_own(paths, alias_value) && alias_value !== path_name) {
			throw new Error('Alias "' + alias_value + '" conflicts with existing schema path "' + alias_value + '"');
		}

		if(has_own(aliases, alias_value) && aliases[alias_value].path !== path_name) {
			throw new Error('Duplicate alias "' + alias_value + '" for paths "' + aliases[alias_value].path + '" and "' + path_name + '"');
		}

		aliases[alias_value] = {path: path_name};
	}

	return aliases;
}

/**
 * Extract field-type entries for all slugs in a single pass.
 *
 * @param {object} field_types
 * @param {string} default_slug
 * @param {string[]} slug_keys
 * @returns {object}
 * @throws {Error} If a registered slug is defined as a primitive instead of an object.
 */
function extract_slug_definitions(field_types, default_slug, slug_keys) {
	const definitions = {
		[default_slug]: {}
	};

	// Pre-initialize objects for explicit slugs
	for(const slug_key of slug_keys) {
		if(is_string(slug_key) && !base_fields_keys.has(slug_key) && slug_key !== default_slug) {
			definitions[slug_key] = {};
		}
	}

	for(const [path_name, field_type] of Object.entries(field_types)) {
		const dot_index = path_name.indexOf('.');
		const root_key = dot_index > -1 ? path_name.substring(0, dot_index) : path_name;

		if(base_fields_keys.has(root_key)) {
			continue;
		}

		// Explicit secondary slugs (strip the root prefix)
		if(has_own(definitions, root_key) && root_key !== default_slug) {
			// Fail fast: Registered slugs must be objects, not flat primitives
			assert_condition(dot_index > -1, 'Registered slug "' + root_key + '" must be defined as a root object in schema');

			const relative_path = path_name.substring(dot_index + 1);
			definitions[root_key][relative_path] = field_type;
		} else {
			// Catch-all default slug (keep the full path)
			definitions[default_slug][path_name] = field_type;
		}
	}

	return definitions;
}

function build_schema_options(schema_options = {}) {
	const next_options = Object.assign({}, defaults.schema_options, schema_options);
	const default_slug = next_options.default_slug;
	const next_slug_keys = [];
	const seen_slug_keys = new Set();

	if(!is_array(next_options.slugs)) {
		next_options.slugs = [];
		return next_options;
	}

	for(const slug_key of next_options.slugs) {
		if(!is_string(slug_key) || slug_key === default_slug || seen_slug_keys.has(slug_key)) {
			continue;
		}

		seen_slug_keys.add(slug_key);
		next_slug_keys.push(slug_key);
	}

	next_options.slugs = next_slug_keys;
	return next_options;
}

/**
 * Validate base-field values and collect deterministic error details.
 *
 * @param {object} document
 * @param {string} id_strategy
 * @returns {{valid: boolean, errors: object[]|null}}
 */
function validate_base_field_values(document, id_strategy) {
	const error_details = [];

	if(id_strategy === IdStrategies.uuidv7 && document.id != null && !is_uuid_v7(document.id)) {
		error_details.push({
			path: 'id',
			code: 'validator_error',
			message: 'Path "id" must be a valid UUIDv7',
			type: 'validator_error',
			value: document.id
		});
	}

	for(const key of ['created_at', 'updated_at']) {
		const value = document[key];

		if(value != null && !is_valid_timestamp(value)) {
			error_details.push({
				path: key,
				code: 'validator_error',
				message: 'Path "' + key + '" must be a valid timestamp',
				type: 'validator_error',
				value
			});
		}
	}

	return {
		valid: error_details.length === 0,
		errors: error_details.length > 0 ? error_details : null
	};
}

function walk_conform_tree(data, branch) {
	if(!is_plain_object(data) || !is_plain_object(branch)) {
		return;
	}

	for(const key of Object.keys(data)) {
		// If key is not in schema branch, delete it
		if(!has_own(branch, key)) {
			delete data[key];
			continue;
		}

		const next_branch = branch[key];
		const next_data = data[key];

		// If branch continues and data is an object, keep walking
		if(next_branch !== true && is_plain_object(next_data)) {
			walk_conform_tree(next_data, next_branch);
		}
	}
}

function walk_schema_for_indexes(current_definition, parent_path, field_registry, index_definitions) {
	for(const [path_segment, field_definition] of Object.entries(current_definition)) {
		const full_path = parent_path ? `${parent_path}.${path_segment}` : path_segment;

		if(!parent_path && base_fields_keys.has(path_segment)) {
			continue;
		}

		if(is_explicit_field(field_definition, field_registry)) {
			const inline_index_definition = normalize_index_definition(field_definition.index, full_path);

			if(inline_index_definition) {
				index_definitions.push(inline_index_definition);
			}
		} else if(is_object(field_definition)) {
			walk_schema_for_indexes(field_definition, full_path, field_registry, index_definitions);
		}
	}
}

function is_explicit_field(field_definition, registry) {
	if(!is_object(field_definition) || !has_own(field_definition, 'type')) {
		return false;
	}

	const type_key = field_definition.type;
	return Array.isArray(type_key) || registry.has_field_type(type_key);
}

function normalize_index_definition(index_input, path_name) {
	if(index_input === undefined || index_input === false || index_input === null) {
		return null;
	}

	// Handle shorthand primitives when path_name is provided
	if(path_name !== undefined) {
		if(index_input === true) {
			return {using: 'gin', path: path_name};
		}

		if(index_input === 1 || index_input === -1) {
			return {using: 'btree', path: path_name, order: index_input};
		}
	}

	// Ensure input is an object for further processing
	if(!is_object(index_input)) {
		return null;
	}

	const raw_definition = Object.assign({}, index_input);

	// Auto-inject path_name if provided and missing
	if(path_name !== undefined && !has_own(raw_definition, 'path')) {
		raw_definition.path = path_name;
	}

	// Determine index type
	let index_type = raw_definition.using;

	if(index_type !== 'gin' && index_type !== 'btree') {
		if(raw_definition.using !== undefined) {
			index_type = 'btree';
		} else if(raw_definition.paths !== undefined || raw_definition.order !== undefined || raw_definition.unique !== undefined) {
			index_type = 'btree';
		} else if(raw_definition.path !== undefined) {
			index_type = 'gin';
		} else {
			return null; // Cannot infer index type
		}
	}

	// Build normalized definition based on type
	const normalized_definition = {using: index_type};

	if(is_string(raw_definition.name)) {
		try {
			assert_identifier(raw_definition.name, 'index_definition.name');
			normalized_definition.name = raw_definition.name;
		} catch(error) {
			// Intentionally ignore invalid names
		}
	}

	if(index_type === 'gin') {
		// GIN: requires a single valid path, rejects order and unique
		if(!is_string(raw_definition.path)) {
			return null;
		}

		try {
			assert_path(raw_definition.path, 'index path');
			normalized_definition.path = raw_definition.path;
			return normalized_definition;
		} catch(error) {
			return null;
		}
	}

	if(index_type === 'btree') {
		// BTREE: allows unique, order, single path, or multiple paths
		let has_valid_path = false;

		if(is_string(raw_definition.path)) {
			try {
				assert_path(raw_definition.path, 'index path');
				normalized_definition.path = raw_definition.path;
				normalized_definition.order = (raw_definition.order === 1 || raw_definition.order === -1) ? raw_definition.order : 1;
				has_valid_path = true;
			} catch(error) {
			}
		}

		if(!has_valid_path && is_object(raw_definition.paths)) {
			const valid_paths = {};

			for(const [p_value, p_order] of Object.entries(raw_definition.paths)) {
				if(!is_string(p_value) || (p_order !== 1 && p_order !== -1)) {
					continue;
				}

				try {
					assert_path(p_value, 'index path');
					valid_paths[p_value] = p_order;
				} catch(error) {
				}
			}

			if(Object.keys(valid_paths).length > 0) {
				normalized_definition.paths = valid_paths;
				has_valid_path = true;
			}
		}

		if(!has_valid_path) {
			return null;
		}

		if(typeof raw_definition.unique === 'boolean') {
			normalized_definition.unique = raw_definition.unique;
		}

		return normalized_definition;
	}
}

export default Schema;
