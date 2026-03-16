import defaults from '#src/constants/defaults.js';
import ValidationError from '#src/errors/validation-error.js';
import compile_schema from '#src/schema/schema-compiler.js';
import {default_field_type_registry} from '#src/field-types/registry.js';
import {assert_condition, assert_identifier, assert_path} from '#src/utils/assert.js';
import {has_own} from '#src/utils/object.js';
import {is_function, is_object, is_string} from '#src/utils/value.js';

const base_fields = Object.freeze({
	id: Object.freeze({type: 'Mixed'}),
	created_at: Object.freeze({type: Date}),
	updated_at: Object.freeze({type: Date})
});
const base_fields_keys = new Set(Object.keys(base_fields));

function Schema(schema_definition = {}, options = {}) {
	// 1. Prepare schema definition with missing system fields
	inject_base_fields(schema_definition);

	// 2. Compile schema
	this.$compiled = compile_schema(schema_definition);

	// 3. Initialize properties
	this.indexes = [];
	this.options = Object.assign({}, defaults.schema_options, options);

	this.strict = this.options.strict !== false;
	this.paths = Object.assign({}, this.$compiled.get_introspection().field_types);
	this.$field_registry = default_field_type_registry;
	this.methods = Object.create(null);

	// 4. Extract and register indexes defined inline on fields
	this.register_field_indexes(schema_definition);
}

// --- PUBLIC API ---

Schema.prototype.validate = function (payload) {
	const validation_result = this.$compiled.validate(payload);

	if(validation_result.valid) {
		return validation_result;
	}

	throw new ValidationError('Schema validation failed', validation_result.errors);
};

Schema.prototype.get_path = function (path_name) {
	if(has_own(this.paths, path_name)) {
		return this.paths[path_name];
	}

	return null;
};

Schema.prototype.get_path_type = function (path_name) {
	return this.$compiled.get_path_type(path_name);
};

Schema.prototype.is_array_root = function (path_name) {
	return this.$compiled.is_array_root(path_name);
};

Schema.prototype.create_index = function (index_definition) {
	const normalized_index_definition = normalize_index_definition(index_definition);

	if(normalized_index_definition) {
		this.indexes.push(normalized_index_definition);
	}

	return this; // Allows chaining
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

Schema.prototype.method = function (method_name, method_implementation) {
	assert_identifier(method_name, 'method_name');
	assert_condition(is_function(method_implementation), 'method_implementation must be a function');
	assert_condition(has_own(this.methods, method_name) === false, 'Schema method "' + method_name + '" already exists');

	this.methods[method_name] = method_implementation;
	return this;
};

Schema.prototype.collect_field_defined_indexes = function (schema_definition) {
	const index_definitions = [];
	const schema_instance = this;

	collect_paths(schema_definition, '');

	return index_definitions;

	function collect_paths(current_definition, parent_path) {
		for(const [path_segment, field_definition] of Object.entries(current_definition)) {
			const full_path = parent_path ? `${parent_path}.${path_segment}` : path_segment;

			if(!parent_path && base_fields_keys.has(path_segment)) {
				continue;
			}

			if(is_explicit_field(field_definition, schema_instance.$field_registry)) {
				const inline_index_definition = normalize_index_definition(field_definition.index, full_path);

				if(inline_index_definition) {
					index_definitions.push(inline_index_definition);
				}
			} else if(is_object(field_definition)) {
				collect_paths(field_definition, full_path);
			}
		}
	}
};

Schema.prototype.register_field_indexes = function (schema_definition) {
	const field_defined_indexes = this.collect_field_defined_indexes(schema_definition);

	for(const index_definition of field_defined_indexes) {
		this.create_index(index_definition);
	}

	return this;
};

// --- INTERNAL MODULE FUNCTIONS ---

function inject_base_fields(schema_def) {
	for(const [field_name, field_config] of Object.entries(base_fields)) {
		if(!has_own(schema_def, field_name)) {
			schema_def[field_name] = Object.assign({}, field_config);
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

	// 1. Handle Shorthand Primitives (when path_name is provided)
	if(path_name !== undefined) {
		if(index_input === true) {
			return {using: 'gin', path: path_name};
		}

		if(index_input === 1 || index_input === -1) {
			return {using: 'btree', path: path_name, order: index_input};
		}
	}

	// 2. Ensure input is an object for further processing
	if(!is_object(index_input)) {
		return null;
	}

	const raw_definition = Object.assign({}, index_input);

	// Auto-inject path_name if provided and missing
	if(path_name !== undefined && !has_own(raw_definition, 'path')) {
		raw_definition.path = path_name;
	}

	// 3. Determine index type (using)
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

	// 4. Build normalized definition based on type
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

	return null;
}

export default Schema;
