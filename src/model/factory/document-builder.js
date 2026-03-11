import {deep_clone, get_callable, has_own, to_plain_object} from '#src/utils/object.js';
import {is_function, is_not_object, is_plain_object} from '#src/utils/value.js';
import {base_field_keys, DocumentInputMode, unsafe_from_keys} from '#src/model/factory/constants.js';

/**
 * Normalizes incoming document input into a document-ready shape.
 *
 * Process:
 * - inspect incoming shape
 * - convert object-like input into a plain object when needed
 * - extract payload/base fields using the selected mode
 * - return a document-ready normalized input object
 *
 * @param {*} input_data External input data.
 * @param {string} mode_value Input normalization mode.
 * @returns {{payload: object, base_fields: object}}
 */
function normalize_document_input(input_data, mode_value) {
	// 1. Guard against primitives, null, and arrays
	if(is_not_object(input_data)) {
		return {payload: {}, base_fields: {}};
	}

	// 2. Convert class instances, Mongoose models, and custom objects into a plain object
	let source = input_data;

	// Its a class or constructor instance of some sort
	if(!is_plain_object(source)) {
		const serialize = get_callable(source, 'to_json', 'toJSON', to_plain_object);

		// Execute using .call() to pass 'this' for class methods, and 'source' as the first arg for utilities.
		source = serialize.call(source, source);
	}

	// Double check plain-object conversion succeeded before proceeding
	if(!is_plain_object(source)) {
		return {payload: {}, base_fields: {}};
	}

	// Input contract:
	// - Model.from(...): extract root base fields and fold everything else into payload
	// - Model.hydrate(...): extract root base fields and use `source.data` as payload when present
	const uses_row_payload = mode_value === DocumentInputMode.Hydrate && is_plain_object(source.data);
	const raw_payload = uses_row_payload ? source.data : source;
	const payload = deep_clone(raw_payload);

	// Base fields are reserved at the document root for both modes.
	// In `from`, everything beyond those keys stays in payload, including a root `data` key.
	// In `hydrate`, the root payload comes from `source.data` when that envelope exists.
	if(!uses_row_payload) {
		for(const base_field_key of base_field_keys) {
			delete payload[base_field_key];
		}
	}

	for(const unsafe_key of unsafe_from_keys) {
		delete payload[unsafe_key];
	}

	const base_fields = {};

	if(has_own(source, 'id')) {
		base_fields.id = source.id;
	}

	if(has_own(source, 'created_at')) {
		base_fields.created_at = source.created_at;
	}

	if(has_own(source, 'updated_at')) {
		base_fields.updated_at = source.updated_at;
	}

	return {payload, base_fields};
}

/**
 * Normalizes imported payload data before document construction.
 *
 * @param {object} schema_instance Schema-like object.
 * @param {*} payload_source Source payload value.
 * @returns {object}
 */
function conform_payload_to_schema(schema_instance, payload_source) {
	// 1. Turn flat schema paths into a nested lookup tree.
	// Example: `profile.name` becomes `{ profile: { name: true } }`.
	// Root base fields are excluded here because they are not payload paths.
	const schema_tree = {};
	const schema_paths = resolve_schema_path_names(schema_instance);

	const conform_payload_branch_to_schema = (current_payload, current_schema_branch) => {
		// 2. Walk one payload branch and copy only keys that the schema tree allows.
		// Leaves (`true`) copy the incoming value as-is; nested objects recurse.
		if(!is_plain_object(current_payload) || !is_plain_object(current_schema_branch)) {
			return {};
		}

		const filtered_payload = {};

		for(const [key, value] of Object.entries(current_payload)) {
			if(!has_own(current_schema_branch, key)) {
				continue;
			}

			const schema_branch = current_schema_branch[key];

			// A leaf path means the schema allows this value at this exact key.
			// Non-plain values also stop recursion here and are copied directly.
			if(schema_branch === true || !is_plain_object(value)) {
				filtered_payload[key] = deep_clone(value);
				continue;
			}

			filtered_payload[key] = conform_payload_branch_to_schema(value, schema_branch);
		}

		return filtered_payload;
	};

	for(const path_name of schema_paths) {
		// Ignore empty or invalid path entries from schema introspection.
		if(typeof path_name !== 'string' || path_name.length === 0) {
			continue;
		}

		// Split a flat schema path like `profile.name` into segments so we can
		// build the nested lookup tree branch by branch.
		const path_segments = path_name.split('.');
		let current_branch = schema_tree;

		for(let segment_index = 0; segment_index < path_segments.length; segment_index++) {
			const segment_value = path_segments[segment_index];
			const is_leaf = segment_index === path_segments.length - 1;

			// Root base fields do not belong to payload conformance.
			// They were already extracted before this step.
			if(segment_index === 0 && base_field_keys.has(segment_value)) {
				current_branch = null;
				break;
			}

			// Mark the final segment as an allowed payload leaf.
			if(is_leaf) {
				current_branch[segment_value] = true;
				break;
			}

			// Create the next nested branch when the path continues deeper.
			if(!is_plain_object(current_branch[segment_value])) {
				current_branch[segment_value] = {};
			}

			current_branch = current_branch[segment_value];
		}
	}

	// 3. Apply the schema tree to the incoming payload and return only the allowed shape.
	return conform_payload_branch_to_schema(payload_source, schema_tree);
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
		if(base_field_keys.has(key)) {
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
	const schema_instance = Model.schema_instance;
	const normalized_base_fields = {};

	for(const base_field_key of base_field_keys) {
		if(has_own(base_fields, base_field_key) === false) {
			continue;
		}

		let next_base_field_value = base_fields[base_field_key];
		const field_type = is_function(schema_instance?.get_path)
			? schema_instance.get_path(base_field_key)
			: null;

		try {
			if(field_type && is_function(field_type.apply_set)) {
				next_base_field_value = field_type.apply_set(next_base_field_value, {
					path: base_field_key,
					mode: 'set'
				});
			}

			if(field_type && is_function(field_type.cast)) {
				next_base_field_value = field_type.cast(next_base_field_value, {
					path: base_field_key,
					mode: 'set'
				});
			}
		} catch {
			continue;
		}

		normalized_base_fields[base_field_key] = next_base_field_value;
	}

	if(is_persisted) {
		const next_document = new Model({});

		Model.apply_document_row(next_document, {
			id: normalized_base_fields.id,
			data: normalized_payload,
			created_at: normalized_base_fields.created_at,
			updated_at: normalized_base_fields.updated_at
		});

		return next_document;
	}

	const next_document = new Model(Object.assign({}, normalized_payload, normalized_base_fields));

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
	normalize_document_input,
	filter_loose_payload,
	conform_payload_to_schema,
	resolve_schema_path_names
};
