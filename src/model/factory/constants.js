const update_path_root_segment_pattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const update_path_nested_segment_pattern = /^(?:[a-zA-Z_][a-zA-Z0-9_]*|[0-9]+)$/;
const row_base_fields = new Set(['id', 'created_at', 'updated_at']);
const timestamp_fields = new Set(['created_at', 'updated_at']);
const unsafe_from_keys = new Set(['__proto__', 'constructor', 'prototype']);

export {
	row_base_fields,
	timestamp_fields,
	unsafe_from_keys,
	update_path_root_segment_pattern,
	update_path_nested_segment_pattern
};
