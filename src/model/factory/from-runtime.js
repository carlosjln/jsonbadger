import {deep_clone, has_own} from '#src/utils/object.js';
import {is_function, is_not_object, is_plain_object} from '#src/utils/value.js';

import {
	row_base_fields,
	unsafe_from_keys
} from '#src/model/factory/constants.js';

/**
 * Resolves the effective strict mode for Model.from().
 *
 * @param {object} schema_instance Schema-like object.
 * @param {object|undefined} runtime_options Per-call runtime options.
 * @returns {boolean}
 */
function resolve_from_strict_mode(schema_instance, runtime_options) {
	return runtime_options?.strict ?? schema_instance.strict;
}

/**
 * Extracts payload and base fields from an external source object.
 *
 * @param {object} schema_instance Schema-like object.
 * @param {*} source_value External source value.
 * @returns {{payload: object, base_fields: object}}
 */
function resolve_source_data(schema_instance, source_value) {
	const source_object = is_plain_object(source_value) ? source_value : {};
	const payload = is_plain_object(source_object.data) ? source_object.data : source_object;
	const base_fields = {};

	for(const base_field_key of row_base_fields) {
		if(has_own(source_object, base_field_key) === false) {
			continue;
		}

		const field_type = schema_instance.get_path(base_field_key);

		if(!field_type || !is_function(field_type.normalize)) {
			continue;
		}

		try {
			base_fields[base_field_key] = field_type.normalize(source_object[base_field_key], {
				path: base_field_key,
				mode: 'set'
			});
		} catch(error) {
			continue;
		}
	}

	return {
		payload,
		base_fields
	};
}

/**
 * Normalizes imported payload data before document construction.
 *
 * @param {object} schema_instance Schema-like object.
 * @param {*} payload_source Source payload value.
 * @param {boolean} strict_mode Whether strict filtering is enabled.
 * @returns {object}
 */
function normalize_payload(schema_instance, payload_source, strict_mode) {
	if(!is_plain_object(payload_source)) {
		return {};
	}

	const payload_input = strict_mode ? filter_strict_payload(schema_instance, payload_source) : filter_loose_payload(payload_source);

	return schema_instance.validate(payload_input);
}

/**
 * Filters payload keys against the declared schema tree.
 *
 * @param {object} schema_instance Schema-like object.
 * @param {object} payload_source Source payload object.
 * @returns {object}
 */
function filter_strict_payload(schema_instance, payload_source) {
	const schema_tree = {};
	const schema_paths = resolve_schema_path_names(schema_instance);

	for(const path_name of schema_paths) {
		if(typeof path_name !== 'string' || path_name.length === 0) {
			continue;
		}

		const path_segments = path_name.split('.');
		let current_branch = schema_tree;

		for(let segment_index = 0; segment_index < path_segments.length; segment_index++) {
			const segment_value = path_segments[segment_index];
			const is_leaf = segment_index === path_segments.length - 1;

			if(segment_index === 0 && row_base_fields.has(segment_value)) {
				current_branch = null;
				break;
			}

			if(is_leaf) {
				current_branch[segment_value] = true;
				break;
			}

			if(!is_plain_object(current_branch[segment_value])) {
				current_branch[segment_value] = {};
			}

			current_branch = current_branch[segment_value];
		}
	}

	return filter_strict_payload_branch(payload_source, schema_tree);
}

/**
 * Recursively filters a payload branch against a schema branch.
 *
 * @param {*} current_payload Current payload branch.
 * @param {*} current_schema_branch Current schema branch.
 * @returns {object}
 */
function filter_strict_payload_branch(current_payload, current_schema_branch) {
	if(!is_plain_object(current_payload) || !is_plain_object(current_schema_branch)) {
		return {};
	}

	const filtered_payload = {};

	for(const [key, value] of Object.entries(current_payload)) {
		if(unsafe_from_keys.has(key) || row_base_fields.has(key) || !has_own(current_schema_branch, key)) {
			continue;
		}

		const schema_branch = current_schema_branch[key];

		if(schema_branch === true || !is_plain_object(value) || !is_plain_object(schema_branch)) {
			filtered_payload[key] = deep_clone(value);
			continue;
		}

		filtered_payload[key] = filter_strict_payload_branch(value, schema_branch);
	}

	return filtered_payload;
}

/**
 * Filters payload keys without enforcing schema strictness.
 *
 * @param {object} payload_source Source payload object.
 * @returns {object}
 */
function filter_loose_payload(payload_source) {
	const sanitized_payload = {};

	for(const [key, value] of Object.entries(payload_source)) {
		if(unsafe_from_keys.has(key) || row_base_fields.has(key)) {
			continue;
		}

		sanitized_payload[key] = deep_clone(value);
	}

	return sanitized_payload;
}

/**
 * Builds either a new or persisted document instance from normalized inputs.
 *
 * @param {Function} Model Model constructor.
 * @param {object} normalized_payload Normalized payload data.
 * @param {object} base_fields Normalized base-field values.
 * @param {boolean} is_persisted Whether the document should be marked persisted.
 * @returns {object}
 */
function build_document_instance(Model, normalized_payload, base_fields, is_persisted) {
	if(is_persisted) {
		const next_document = new Model({});

		Model.apply_document_row(next_document, {
			id: base_fields.id,
			data: normalized_payload,
			created_at: base_fields.created_at,
			updated_at: base_fields.updated_at
		});

		return next_document;
	}

	const next_document = new Model(Object.assign({}, normalized_payload, base_fields));

	next_document.clear_modified();
	next_document.is_new = true;
	return next_document;
}

/**
 * Resolves declared schema path names when available.
 *
 * @param {*} schema_instance Schema-like object.
 * @returns {string[]}
 */
function resolve_schema_path_names(schema_instance) {
	if(is_not_object(schema_instance.paths)) {
		return [];
	}

	return Object.keys(schema_instance.paths);
}

export {
	build_document_instance,
	filter_loose_payload,
	filter_strict_payload,
	filter_strict_payload_branch,
	normalize_payload,
	resolve_from_strict_mode,
	resolve_schema_path_names,
	resolve_source_data
};
