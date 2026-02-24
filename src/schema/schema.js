import defaults from '#src/constants/defaults.js';

import ValidationError from '#src/errors/validation-error.js';
import schema_compiler from '#src/schema/schema-compiler.js';

import {default_field_type_registry} from '#src/field-types/registry.js';
import {assert_condition, assert_identifier, assert_path} from '#src/utils/assert.js';
import {is_object, is_string} from '#src/utils/value.js';
import {has_own} from '#src/utils/object.js';

export default function Schema(schema_def, options) {
	this.schema_def = schema_def || {};
	this.options = Object.assign({}, defaults.schema_options, options || {});
	this.compiled_schema = schema_compiler(this.schema_def);
	this.schema_description = this.compiled_schema.describe();
	this.indexes = [];

	register_path_level_indexes(this, this.schema_def, '', default_field_type_registry);
}

Schema.prototype.validate = function (payload) {
	const validation_result = this.compiled_schema.validate(payload);

	if(validation_result.error) {
		throw new ValidationError('Schema validation failed', validation_result.error.details);
	}

	return validation_result.value;
};

Schema.prototype.path = function (path_name) {
	if(!this.compiled_schema || typeof this.compiled_schema.path !== 'function') {
		return null;
	}

	return this.compiled_schema.path(path_name);
};

Schema.prototype.get_path_type = function (path_name) {
	if(!this.compiled_schema || typeof this.compiled_schema.get_path_type !== 'function') {
		return null;
	}

	return this.compiled_schema.get_path_type(path_name);
};

Schema.prototype.is_array_root = function (path_name) {
	if(!this.compiled_schema || typeof this.compiled_schema.is_array_root !== 'function') {
		return false;
	}

	return this.compiled_schema.is_array_root(path_name);
};

Schema.prototype.create_index = function (index_spec, index_options) {
	const normalized_index_spec = normalize_index_spec(index_spec);
	const normalized_index_options = normalize_index_options(index_options);

	this.indexes.push({
		index_spec: normalized_index_spec,
		index_options: normalized_index_options
	});

	return this;
};

Schema.prototype.get_indexes = function () {
	const index_definitions = [];
	let index_position = 0;

	while(index_position < this.indexes.length) {
		const index_definition = this.indexes[index_position];
		const index_spec = clone_index_spec(index_definition.index_spec);
		const index_options = Object.assign({}, index_definition.index_options);

		index_definitions.push({
			index_spec: index_spec,
			index_options: index_options
		});
		index_position += 1;
	}

	return index_definitions;
};

function register_path_level_indexes(schema_instance, schema_definition, parent_path, field_registry) {
	const schema_entries = Object.entries(schema_definition);
	let entry_position = 0;

	while(entry_position < schema_entries.length) {
		const schema_entry = schema_entries[entry_position];
		const path_segment = schema_entry[0];
		const field_definition = schema_entry[1];
		const path_value = parent_path ? parent_path + '.' + path_segment : path_segment;

		if(is_explicit_field_definition(field_definition, field_registry)) {
			register_index_option(schema_instance, path_value, field_definition.index);
			entry_position += 1;
			continue;
		}

		if(is_plain_object(field_definition)) {
			register_path_level_indexes(schema_instance, field_definition, path_value, field_registry);
		}

		entry_position += 1;
	}
}

function is_explicit_field_definition(field_definition, field_registry) {
	if(!is_plain_object(field_definition) || !has_own(field_definition, 'type')) {
		return false;
	}

	const type_key = field_definition.type;

	if(Array.isArray(type_key)) {
		return true;
	}

	return field_registry.has_field_type(type_key);
}

function register_index_option(schema_instance, path_value, index_option) {
	if(index_option === undefined || index_option === false) {
		return;
	}

	if(index_option === true) {
		schema_instance.create_index(path_value);
		return;
	}

	if(index_option === 1 || index_option === -1) {
		schema_instance.create_index({
			[path_value]: index_option
		});
		return;
	}

	if(is_plain_object(index_option)) {
		const index_options = Object.assign({}, index_option);
		const direction_value = resolve_path_level_index_direction(path_value, index_options);

		schema_instance.create_index({
			[path_value]: direction_value
		}, index_options);
		return;
	}

	throw new Error('index option at path "' + path_value + '" must be true, false, 1, -1, or an options object');
}

function resolve_path_level_index_direction(path_value, index_options) {
	let direction_value = 1;

	if(has_own(index_options, 'direction')) {
		direction_value = index_options.direction;
		delete index_options.direction;
	}

	if(has_own(index_options, 'order')) {
		direction_value = index_options.order;
		delete index_options.order;
	}

	assert_condition(direction_value === 1 || direction_value === -1, 'index direction for path "' + path_value + '" must be 1 or -1');

	return direction_value;
}

function normalize_index_spec(index_spec) {
	if(is_string(index_spec)) {
		assert_path(index_spec, 'index path');
		return index_spec;
	}

	assert_condition(is_object(index_spec), 'index_spec must be a path string or an object map of paths to sort directions');

	const index_entries = Object.entries(index_spec);
	assert_condition(index_entries.length > 0, 'index_spec object must define at least one indexed path');

	const normalized_spec = {};
	let entry_position = 0;

	while(entry_position < index_entries.length) {
		const index_entry = index_entries[entry_position];
		const path_value = index_entry[0];
		const direction_value = index_entry[1];

		assert_path(path_value, 'index path');
		assert_condition(
			direction_value === 1 || direction_value === -1,
			'index direction for path "' + path_value + '" must be 1 or -1'
		);
		normalized_spec[path_value] = direction_value;
		entry_position += 1;
	}

	return normalized_spec;
}

function normalize_index_options(index_options) {
	if(index_options === undefined) {
		return {};
	}

	assert_condition(is_object(index_options), 'index_options must be an object');

	const normalized_options = Object.assign({}, index_options);

	if(normalized_options.unique !== undefined) {
		assert_condition(typeof normalized_options.unique === 'boolean', 'index_options.unique must be a boolean');
	}

	if(normalized_options.name !== undefined) {
		assert_identifier(normalized_options.name, 'index_options.name');
	}

	return normalized_options;
}

function clone_index_spec(index_spec) {
	if(is_string(index_spec)) {
		return index_spec;
	}

	return Object.assign({}, index_spec);
}

function is_plain_object(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

