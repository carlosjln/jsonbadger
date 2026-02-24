import {assert_condition, assert_identifier, assert_path, quote_identifier} from '#src/utils/assert.js';
import {build_path_literal, split_dot_path} from '#src/utils/object-path.js';
import sql_runner from '#src/sql/sql-runner.js';
import {is_object, is_string} from '#src/utils/value.js';

export default async function ensure_index(table_name, index_spec, data_column, index_options) {
	assert_identifier(table_name, 'table_name');
	assert_identifier(data_column, 'data_column');

	const normalized_index_spec = normalize_index_spec(index_spec);
	const normalized_index_options = normalize_index_options(index_options);

	const table_identifier = quote_identifier(table_name);
	const data_identifier = quote_identifier(data_column);
	const index_name = resolve_index_name(table_name, data_column, normalized_index_spec, normalized_index_options);
	const index_identifier = quote_identifier(index_name);

	if(is_string(normalized_index_spec)) {
		assert_condition(
			normalized_index_options.unique !== true,
			'unique index is not supported for single-path GIN indexes'
		);

		const expression = build_json_path_expression(data_identifier, normalized_index_spec);
		const sql_text =
			'CREATE INDEX IF NOT EXISTS ' + index_identifier +
			' ON ' + table_identifier + ' USING GIN ((' + expression + '));';

		await sql_runner(sql_text, []);
		return;
	}

	const sorted_path_entries = Object.entries(normalized_index_spec);
	const expression_list = [];
	let entry_position = 0;

	while(entry_position < sorted_path_entries.length) {
		const path_entry = sorted_path_entries[entry_position];
		const path_value = path_entry[0];
		const direction_value = path_entry[1];
		const direction_sql = direction_value === -1 ? 'DESC' : 'ASC';
		const expression = build_text_path_expression(data_identifier, path_value);

		expression_list.push('(' + expression + ') ' + direction_sql);
		entry_position += 1;
	}

	const unique_prefix = normalized_index_options.unique ? 'UNIQUE ' : '';
	const sql_text =
		'CREATE ' + unique_prefix + 'INDEX IF NOT EXISTS ' + index_identifier +
		' ON ' + table_identifier + ' (' + expression_list.join(', ') + ');';

	await sql_runner(sql_text, []);
}

function normalize_index_spec(index_spec) {
	if(is_string(index_spec)) {
		assert_path(index_spec, 'index path');
		return index_spec;
	}

	assert_condition(is_object(index_spec), 'index_spec must be a path string or an object map of paths to sort directions');

	const index_entries = Object.entries(index_spec);
	assert_condition(index_entries.length > 0, 'index_spec object must define at least one indexed path');

	const normalized_index_spec = {};
	let entry_position = 0;

	while(entry_position < index_entries.length) {
		const index_entry = index_entries[entry_position];
		const path_value = index_entry[0];
		const direction_value = index_entry[1];

		assert_path(path_value, 'index path');
		assert_condition(direction_value === 1 || direction_value === -1, 'index direction for path "' + path_value + '" must be 1 or -1');

		normalized_index_spec[path_value] = direction_value;
		entry_position += 1;
	}

	return normalized_index_spec;
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

function resolve_index_name(table_name, data_column, index_spec, index_options) {
	if(index_options.name) {
		return index_options.name;
	}

	if(is_string(index_spec)) {
		const path_suffix = index_spec.replace(/\./g, '_');
		return build_index_name(table_name, data_column, path_suffix + '_gin');
	}

	const index_entries = Object.entries(index_spec);
	const path_suffix_parts = [];
	let entry_position = 0;

	while(entry_position < index_entries.length) {
		const index_entry = index_entries[entry_position];
		const path_value = index_entry[0];
		const direction_value = index_entry[1];
		const direction_suffix = direction_value === -1 ? 'desc' : 'asc';
		path_suffix_parts.push(path_value.replace(/\./g, '_') + '_' + direction_suffix);
		entry_position += 1;
	}

	return build_index_name(table_name, data_column, path_suffix_parts.join('_') + '_btree');
}

function build_json_path_expression(data_identifier, path_value) {
	const path_segments = split_dot_path(path_value);

	if(path_segments.length === 1) {
		return data_identifier + " -> '" + path_segments[0] + "'";
	}

	return data_identifier + " #> '" + build_path_literal(path_segments) + "'";
}

function build_text_path_expression(data_identifier, path_value) {
	const path_segments = split_dot_path(path_value);

	if(path_segments.length === 1) {
		return data_identifier + " ->> '" + path_segments[0] + "'";
	}

	return data_identifier + " #>> '" + build_path_literal(path_segments) + "'";
}

function build_index_name(table_name, data_column, path_suffix) {
	const raw_name = 'idx_' + table_name + '_' + data_column + '_' + path_suffix;
	const normalized_name = raw_name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
	return normalized_name.slice(0, 63);
}
