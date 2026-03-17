import defaults from '#src/constants/defaults.js';
import IdStrategies from '#src/constants/id-strategies.js';

import ValidationError from '#src/errors/validation-error.js';

import {default_field_type_registry} from '#src/field-types/registry.js';

import compile_schema from '#src/schema/schema-compiler.js';

import {assert_condition, assert_identifier, assert_path} from '#src/utils/assert.js';
import {has_own} from '#src/utils/object.js';
import {is_function, is_object, is_plain_object, is_string, is_uuid_v7, is_valid_timestamp} from '#src/utils/value.js';

const base_fields = Object.freeze({
	id: Object.freeze({type: 'Mixed'}),
	created_at: Object.freeze({type: Date}),
	updated_at: Object.freeze({type: Date})
});

const base_fields_keys = new Set(Object.keys(base_fields));

function Schema(schema_definition = {}, options = {}) {
	// Prepare schema definition with missing system fields
	inject_base_fields(schema_definition);

	// Compile schema
	this.$compiled = compile_schema(schema_definition);

	// Initialize properties
	this.indexes = [];
	this.options = Object.assign({}, defaults.schema_options, options);

	this.strict = this.options.strict !== false;
	this.paths = Object.assign({}, this.$compiled.get_introspection().field_types);
	this.methods = Object.create(null);
	this.$field_registry = default_field_type_registry;

	// Extract and register indexes defined inline on fields
	this.register_field_indexes(schema_definition);
}

// --- PUBLIC API ---

Schema.prototype.validate = function (document) {
	const payload_result = this.validate_payload(document.data);
	const base_fields_result = this.validate_base_fields(document);

	const errors = [];

	if(payload_result.errors) {
		errors.push(...payload_result.errors);
	}

	if(base_fields_result.errors) {
		errors.push(...base_fields_result.errors);
	}

	if(errors.length > 0) {
		throw new ValidationError('Schema validation failed', errors);
	}

	return {
		valid: true,
		errors: null
	};
};


Schema.prototype.validate_payload = function (payload) {
	const validation_result = this.$compiled.validate(payload);

	if(!validation_result.valid) {
		throw new ValidationError('Schema validation failed', validation_result.errors);
	}

	return validation_result;
};

Schema.prototype.validate_base_fields = function (document) {
	const error_details = [];
	const add_error = (path, message, value) => error_details.push({
		path,
		code: 'validator_error',
		message,
		type: 'validator_error',
		value
	});

	if(this.id_strategy === IdStrategies.uuidv7 && document.id != null && !is_uuid_v7(document.id)) {
		add_error('id', 'Path "id" must be a valid UUIDv7', document.id);
	}

	for(const key of ['created_at', 'updated_at']) {
		const value = document[key];

		if(value != null && !is_valid_timestamp(value)) {
			add_error(key, 'Path "' + key + '" must be a valid timestamp', value);
		}
	}

	if(error_details.length > 0) {
		throw new ValidationError('Schema validation failed', error_details);
	}
};

Schema.prototype.conform = function (payload) {
	if(!is_plain_object(payload)) {
		return;
	}

	const allowed_tree = {};

	// Build a lookup tree of valid schema paths
	for(const path of Object.keys(this.paths)) {
		if(!is_string(path) || path.length === 0) {
			continue;
		}

		const segments = path.split('.');
		let node = allowed_tree;

		for(let i = 0; i < segments.length; i++) {
			const segment = segments[i];

			// Skip internal base fields at root
			if(i === 0 && base_fields_keys.has(segment)) {
				node = null;
				break;
			}

			// Mark leaf node as valid, otherwise initialize branch
			if(i === segments.length - 1) {
				node[segment] = true;
			} else {
				if(!is_plain_object(node[segment])) {
					node[segment] = {};
				}
				node = node[segment];
			}
		}
	}

	// Recursive function to strip unknown keys from the payload
	const walk = (data, branch) => {
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
				walk(next_data, next_branch);
			}
		}
	};

	walk(payload, allowed_tree);

	return payload;
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

	return null;
}

export default Schema;
