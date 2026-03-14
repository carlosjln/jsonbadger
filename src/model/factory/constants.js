const update_path_root_segment_pattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const update_path_nested_segment_pattern = /^(?:[a-zA-Z_][a-zA-Z0-9_]*|[0-9]+)$/;

const DocumentInputMode = Object.freeze({
	From: 'from',
	Hydrate: 'hydrate'
});

const base_field_keys = new Set(['id', 'created_at', 'updated_at']);
const timestamp_fields = new Set(['created_at', 'updated_at']);
const unsafe_from_keys = new Set(['__proto__', 'constructor', 'prototype']);

const update_operator_names = Object.freeze({
	set: '$set',
	insert: '$insert',
	set_lax: '$set_lax'
});

const update_operator_order = Object.freeze([
	update_operator_names.set,
	update_operator_names.insert,
	update_operator_names.set_lax
]);

const set_lax_null_treatments = Object.freeze({
	raise_exception: 'raise_exception',
	use_json_null: 'use_json_null',
	delete_key: 'delete_key',
	return_target: 'return_target'
});

export {
	DocumentInputMode,
	base_field_keys,
	set_lax_null_treatments,
	timestamp_fields,
	unsafe_from_keys,
	update_operator_names,
	update_operator_order,
	update_path_root_segment_pattern,
	update_path_nested_segment_pattern
};
