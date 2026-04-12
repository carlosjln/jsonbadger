import defaults from '#src/constants/defaults.js';
import IDENTITY_FORMAT from '#src/constants/identity-format.js';
import IDENTITY_MODE from '#src/constants/identity-mode.js';
import IDENTITY_TYPE from '#src/constants/identity-type.js';
import ID_STRATEGY from '#src/constants/id-strategy.js';

import ValidationError from '#src/errors/validation-error.js';

import {default_field_type_registry} from '#src/field-types/registry.js';
import jsonpath_exists_compat_operator from '#src/sql/jsonb/read/operators/jsonpath-exists-compat.js';
import jsonpath_exists_native_operator from '#src/sql/jsonb/read/operators/jsonpath-exists-native.js';
import jsonpath_match_compat_operator from '#src/sql/jsonb/read/operators/jsonpath-match-compat.js';
import jsonpath_match_native_operator from '#src/sql/jsonb/read/operators/jsonpath-match-native.js';

import {create_path_validator, prepare_schema_state} from '#src/schema/schema-compiler.js';
import {get_path_type as resolve_path_type, is_array_root as resolve_is_array_root} from '#src/schema/path-introspection.js';

import {assert_condition, assert_identifier, assert_path} from '#src/utils/assert.js';
import {is_array, is_not_array} from '#src/utils/array.js';
import {read_nested_path, write_nested_path} from '#src/utils/object-path.js';
import {deep_clone, has_own} from '#src/utils/object.js';
import {is_function, is_integer_string, is_object, is_plain_object, is_string, is_uuid_v7, is_valid_timestamp} from '#src/utils/value.js';

const base_fields = Object.freeze({
	id: Object.freeze({type: 'Mixed'}),
	created_at: Object.freeze({type: Date}),
	updated_at: Object.freeze({type: Date})
});

const base_fields_keys = new Set(Object.keys(base_fields));

/**
 * Compile one declarative schema instance.
 *
 * @param {object} schema_definition
 * @param {object} schema_options
 * @returns {void}
 */
function Schema(schema_definition = {}, schema_options = {}) {
	const $schema = apply_base_fields(schema_definition);
	const $options = build_schema_options(schema_options);
	const {path_introspection, field_types} = prepare_schema_state($schema);
	const default_slug = $options.default_slug;
	const extra_slug_keys = $options.slugs;

	this.$field_registry = default_field_type_registry;
	this.$path_introspection = path_introspection;
	this.$field_types = field_types;

	this.indexes = [];
	this.options = $options;
	this.id_strategy = $options.id_strategy;
	this.auto_index = $options.auto_index;
	this.methods = Object.create(null);
	this.validators = Object.create(null);
	this.aliases = collect_aliases(field_types);
	this.$conform_tree = build_conform_tree(field_types, default_slug, extra_slug_keys);
	this.$runtime = Object.create(null);

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
	const validators = Object.create(null);

	// Root document validator
	validators.base_fields = (document) => {
		return validate_base_field_values(document, resolve_base_field_validation_identity(this));
	};

	// Get all definitions in one pass
	const slug_definitions = build_slug_field_maps(this.$field_types, default_slug, registered_slug_keys);

	// Wire up the validators dynamically
	for(const [slug_key, field_types] of Object.entries(slug_definitions)) {
		const validate_slice = create_path_validator(field_types);

		validators[slug_key] = (document) => {
			const slice = (is_object(document) && has_own(document, slug_key)) ? document[slug_key] : {};
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
	collect_schema_indexes(schema_definition, '', this.$field_registry, index_definitions);
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

		if(!validation_result.valid && is_array(validation_result.errors)) {
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
	const validation_result = validate_base_field_values(document, resolve_base_field_validation_identity(this));

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

/**
 * Remove keys that are not allowed by the compiled schema tree.
 *
 * @param {object} document
 * @returns {object|undefined}
 */
Schema.prototype.conform = function (document) {
	prune_document_shape(document, this.$conform_tree);
	return document;
};

/**
 * Cast one full document envelope according to compiled schema paths.
 *
 * @param {object} document
 * @returns {object}
 */
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

Schema.prototype.add_method = function (method_name, method_implementation) {
	assert_identifier(method_name, 'method_name');
	assert_condition(is_function(method_implementation), 'method_implementation must be a function');
	assert_condition(!has_own(this.methods, method_name), 'Schema method "' + method_name + '" already exists');

	this.methods[method_name] = method_implementation;
	return this;
};

/**
 * Bind one compiled schema instance against one connection context.
 *
 * @param {object|null|undefined} connection
 * @returns {Schema}
 */
Schema.prototype.$bind_connection = function (connection) {
	this.$runtime = Object.create(null);
	this.$runtime.read_operators = build_read_operators(connection);
	this.$runtime.identity = build_identity_runtime(this.options.identity, connection);
	return this;
};

/**
 * Clone one compiled schema instance while keeping runtime state isolated.
 *
 * @returns {Schema}
 */
Schema.prototype.clone = function () {
	const cloned_schema = Object.create(Schema.prototype);

	cloned_schema.$field_registry = this.$field_registry;
	cloned_schema.$path_introspection = deep_clone(this.$path_introspection);
	cloned_schema.$field_types = deep_clone(this.$field_types);

	cloned_schema.indexes = this.get_indexes();
	cloned_schema.options = deep_clone(this.options);
	cloned_schema.id_strategy = this.id_strategy;
	cloned_schema.auto_index = this.auto_index;
	cloned_schema.methods = Object.assign(Object.create(null), this.methods);
	cloned_schema.validators = Object.create(null);
	cloned_schema.aliases = deep_clone(this.aliases);
	cloned_schema.$conform_tree = deep_clone(this.$conform_tree);
	cloned_schema.$runtime = Object.create(null);

	return cloned_schema;
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

function apply_base_fields(schema_def) {
	const next_schema = Object.assign({}, schema_def);

	for(const [field_name, field_config] of Object.entries(base_fields)) {
		if(!has_own(next_schema, field_name)) {
			next_schema[field_name] = Object.assign({}, field_config);
		}
	}

	return next_schema;
}

function build_conform_tree(paths, default_slug, slug_keys) {
	const allowed_tree = {};
	const extra_slug_set = new Set(slug_keys || []);

	for(const base_field_key of base_fields_keys) {
		allowed_tree[base_field_key] = true;
	}

	for(const path_name of Object.keys(paths)) {
		const path_segments = path_name.split('.');
		const root_segment = path_segments[0];
		let current_branch = allowed_tree;
		let target_segments = path_segments;

		if(base_fields_keys.has(root_segment)) {
			continue;
		}

		// Unprefixed schema paths belong to the default slug, so wrap them under that slug root here.
		if(!extra_slug_set.has(root_segment)) {
			target_segments = [default_slug, ...path_segments];
		}

		const depth = target_segments.length - 1;

		for(let i = 0; i < depth; i++) {
			const segment_value = target_segments[i];

			if(!is_plain_object(current_branch[segment_value])) {
				current_branch[segment_value] = {};
			}

			current_branch = current_branch[segment_value];
		}

		current_branch[target_segments[depth]] = true;
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
function build_slug_field_maps(field_types, default_slug, slug_keys) {
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

/**
 * Build normalized schema options, including merged identity config and the temporary
 * derived `id_strategy` bridge still used by downstream code.
 *
 * @param {object} schema_options
 * @returns {object}
 * @throws {Error}
 */
function build_schema_options(schema_options = {}) {
	const next_options = Object.assign({}, defaults.schema_options, schema_options);
	const identity_options = build_identity_options(schema_options);
	const default_slug = next_options.default_slug;
	const next_slug_keys = [];
	const seen_slug_keys = new Set();

	validate_identity_options(identity_options);

	next_options.identity = identity_options;
	next_options.id_strategy = resolve_identity_id_strategy(identity_options);

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
 * Merge the public identity namespace and map the temporary legacy `id_strategy` input
 * while the rest of the rollout is still in progress.
 *
 * @param {object} schema_options
 * @returns {object}
 * @throws {Error}
 */
function build_identity_options(schema_options) {
	const next_identity = Object.assign({}, defaults.schema_options.identity);
	const has_identity_options = has_own(schema_options, 'identity');
	const has_legacy_id_strategy = has_own(schema_options, 'id_strategy');
	const legacy_id_strategy = schema_options.id_strategy;
	const valid_legacy_strategy_values = Object.values(ID_STRATEGY);

	if(has_identity_options) {
		assert_condition(is_plain_object(schema_options.identity), 'identity must be a plain object');
		Object.assign(next_identity, schema_options.identity);
		return next_identity;
	}

	if(!has_legacy_id_strategy) {
		return next_identity;
	}

	assert_condition(
		valid_legacy_strategy_values.includes(legacy_id_strategy),
		'id_strategy must be one of: ' + valid_legacy_strategy_values.join(', ')
	);

	if(legacy_id_strategy === ID_STRATEGY.uuidv7) {
		next_identity.type = IDENTITY_TYPE.uuid;
		next_identity.format = IDENTITY_FORMAT.uuidv7;
		next_identity.mode = IDENTITY_MODE.fallback;
	}

	return next_identity;
}

/**
 * Validate the static identity shape during schema construction.
 *
 * @param {object} identity_options
 * @returns {void}
 * @throws {Error}
 */
function validate_identity_options(identity_options) {
	validate_identity_option_shape(identity_options);
	validate_identity_option_combination(identity_options);
}

/**
 * Validate the raw identity option shape before checking supported phase-one combinations.
 *
 * @param {object} identity_options
 * @returns {void}
 * @throws {Error}
 */
function validate_identity_option_shape(identity_options) {
	const identity_types = Object.values(IDENTITY_TYPE);
	const identity_modes = Object.values(IDENTITY_MODE);
	const identity_formats = Object.values(IDENTITY_FORMAT);

	assert_condition(identity_types.includes(identity_options.type), 'identity.type must be one of: ' + identity_types.join(', '));
	assert_condition(identity_modes.includes(identity_options.mode), 'identity.mode must be one of: ' + identity_modes.join(', '));
	assert_condition(
		identity_options.format == null || identity_formats.includes(identity_options.format),
		'identity.format must be null or one of: ' + identity_formats.join(', ')
	);
	assert_condition(
		identity_options.generator == null || is_function(identity_options.generator),
		'identity.generator must be a function or null'
	);
}

/**
 * Validate the supported phase-one identity combinations.
 *
 * @param {object} identity_options
 * @returns {void}
 * @throws {Error}
 */
function validate_identity_option_combination(identity_options) {
	if(identity_options.type === IDENTITY_TYPE.bigint) {
		assert_condition(identity_options.format == null, 'identity.type=bigint requires identity.format=null');
		assert_condition(identity_options.mode === IDENTITY_MODE.fallback, 'identity.type=bigint only supports identity.mode=fallback in phase one');
		return;
	}

	assert_condition(identity_options.format === IDENTITY_FORMAT.uuidv7, 'identity.type=uuid requires identity.format=uuidv7 in phase one');

	if(identity_options.mode === IDENTITY_MODE.application) {
		assert_condition(is_function(identity_options.generator), 'identity.mode=application requires identity.generator');
	}
}

/**
 * Resolve the temporary schema-level `id_strategy` bridge from the public identity config.
 *
 * @param {object} identity_options
 * @returns {string}
 */
function resolve_identity_id_strategy(identity_options) {
	if(identity_options.type === IDENTITY_TYPE.uuid && identity_options.format === IDENTITY_FORMAT.uuidv7) {
		return ID_STRATEGY.uuidv7;
	}

	return ID_STRATEGY.bigserial;
}

/**
 * Resolve the bound read-operator implementations for one connection context.
 *
 * @param {object|null|undefined} connection
 * @returns {object}
 */
function build_read_operators(connection) {
	const supports_jsonpath = connection?.server_capabilities?.supports_jsonpath;

	return {
		$json_path_exists: supports_jsonpath ? jsonpath_exists_native_operator : jsonpath_exists_compat_operator,
		$json_path_match: supports_jsonpath ? jsonpath_match_native_operator : jsonpath_match_compat_operator
	};
}

/**
 * Resolve the bound identity runtime for one compiled schema and connection context.
 *
 * @param {object} identity_options
 * @param {object|null|undefined} connection
 * @returns {object}
 * @throws {Error}
 */
function build_identity_runtime(identity_options, connection) {
	const supports_uuidv7 = connection?.server_capabilities?.supports_uuidv7;

	if(identity_options.type === IDENTITY_TYPE.bigint) {
		return {
			type: IDENTITY_TYPE.bigint,
			format: null,
			mode: IDENTITY_MODE.database,
			id_strategy: ID_STRATEGY.bigserial,
			requires_explicit_id: false,
			column_sql: 'id BIGSERIAL PRIMARY KEY'
		};
	}

	if(identity_options.mode === IDENTITY_MODE.application) {
		return {
			type: IDENTITY_TYPE.uuid,
			format: IDENTITY_FORMAT.uuidv7,
			mode: IDENTITY_MODE.application,
			id_strategy: ID_STRATEGY.uuidv7,
			requires_explicit_id: true,
			column_sql: 'id UUID PRIMARY KEY'
		};
	}

	if(identity_options.mode === IDENTITY_MODE.database) {
		assert_condition(connection != null, 'identity.mode=database requires a bound connection');
		assert_condition(supports_uuidv7, 'identity.mode=database requires PostgreSQL uuidv7() support');

		return {
			type: IDENTITY_TYPE.uuid,
			format: IDENTITY_FORMAT.uuidv7,
			mode: IDENTITY_MODE.database,
			id_strategy: ID_STRATEGY.uuidv7,
			requires_explicit_id: false,
			column_sql: 'id UUID PRIMARY KEY DEFAULT uuidv7()'
		};
	}

	assert_condition(connection != null, 'identity.mode=fallback requires a bound connection');

	if(supports_uuidv7) {
		return {
			type: IDENTITY_TYPE.uuid,
			format: IDENTITY_FORMAT.uuidv7,
			mode: IDENTITY_MODE.database,
			id_strategy: ID_STRATEGY.uuidv7,
			requires_explicit_id: false,
			column_sql: 'id UUID PRIMARY KEY DEFAULT uuidv7()'
		};
	}

	assert_condition(
		is_function(identity_options.generator),
		'identity.mode=fallback requires PostgreSQL uuidv7() support or identity.generator'
	);

	return {
		type: IDENTITY_TYPE.uuid,
		format: IDENTITY_FORMAT.uuidv7,
		mode: IDENTITY_MODE.application,
		id_strategy: ID_STRATEGY.uuidv7,
		requires_explicit_id: true,
		column_sql: 'id UUID PRIMARY KEY'
	};
}

/**
 * Validate base-field values and collect deterministic error details.
 *
 * @param {object} document
 * @param {object} identity_state
 * @param {string} identity_state.type
 * @param {string|null} identity_state.format
 * @returns {{valid: boolean, errors: object[]|null}}
 */
function validate_base_field_values(document, identity_state) {
	const error_details = [];

	if(document.id != null) {
		if(identity_state.type === IDENTITY_TYPE.uuid && identity_state.format === IDENTITY_FORMAT.uuidv7 && !is_uuid_v7(document.id)) {
			error_details.push({
				path: 'id',
				code: 'validator_error',
				message: 'Path "id" must be a valid UUIDv7',
				type: 'validator_error',
				value: document.id
			});
		}

		if(identity_state.type === IDENTITY_TYPE.bigint && !is_integer_string(document.id)) {
			error_details.push({
				path: 'id',
				code: 'validator_error',
				message: 'Path "id" must be a numeric string',
				type: 'validator_error',
				value: document.id
			});
		}
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

/**
 * Resolve the identity shape used by schema-level base-field validation.
 *
 * @param {Schema} schema_instance
 * @returns {{type: string, format: string|null}}
 */
function resolve_base_field_validation_identity(schema_instance) {
	const runtime_identity = schema_instance.$runtime.identity;

	if(runtime_identity) {
		return {
			type: runtime_identity.type,
			format: runtime_identity.format
		};
	}

	return {
		type: schema_instance.options.identity.type,
		format: schema_instance.options.identity.format
	};
}

/**
 * Remove keys that are not allowed by one compiled schema branch and recurse into nested objects.
 *
 * @param {object} document
 * @param {object} branch
 * @returns {void}
 */
function prune_document_shape(document, branch) {
	if(!is_object(document) || !is_object(branch)) {
		return;
	}

	for(const key of Object.keys(document)) {
		// If key is not in schema branch, delete it
		if(!has_own(branch, key)) {
			delete document[key];
			continue;
		}

		const next_branch = branch[key];
		const next_data = document[key];

		// If branch continues and data is an object, keep walking
		if(next_branch !== true && is_object(next_data)) {
			prune_document_shape(next_data, next_branch);
		}
	}

	return document;
}

/**
 * Recursively collect inline index definitions from one schema definition tree.
 *
 * @param {object} current_definition
 * @param {string} parent_path
 * @param {object} field_registry
 * @param {object[]} index_definitions
 * @returns {void}
 */
function collect_schema_indexes(current_definition, parent_path, field_registry, index_definitions) {
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
			collect_schema_indexes(field_definition, full_path, field_registry, index_definitions);
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
