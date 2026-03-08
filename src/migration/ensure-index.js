import {assert_condition, assert_identifier, assert_path, quote_identifier} from '#src/utils/assert.js';
import {build_path_literal, split_dot_path} from '#src/utils/object-path.js';
import sql_runner from '#src/sql/sql-runner.js';
import {is_object, is_string} from '#src/utils/value.js';

// TODO: should receive a single object param
async function ensure_index(table_name, index_definition, data_column, connection) {
	assert_identifier(table_name, 'table_name');
	assert_identifier(data_column, 'data_column');
	assert_sql_safe_index_definition(index_definition);

	const table_identifier = quote_identifier(table_name);
	const data_identifier = quote_identifier(data_column);
	const index_name = resolve_index_name(table_name, data_column, index_definition);
	const index_identifier = quote_identifier(index_name);

	if(index_definition.using === 'gin') {
		const expression = build_json_path_expression(data_identifier, index_definition.path);
		const sql_text =
			'CREATE INDEX IF NOT EXISTS ' + index_identifier +
			' ON ' + table_identifier + ' USING GIN ((' + expression + '));';

		await sql_runner(sql_text, [], connection);
		return;
	}

	const btree_path_order_map = build_btree_path_order_map(index_definition);
	const sorted_path_entries = Object.entries(btree_path_order_map);
	const expression_list = [];
	let entry_position = 0;

	while(entry_position < sorted_path_entries.length) {
		const path_entry = sorted_path_entries[entry_position];
		const path_value = path_entry[0];
		const order_value = path_entry[1];
		const order_sql = order_value === -1 ? 'DESC' : 'ASC';
		const expression = build_text_path_expression(data_identifier, path_value);

		expression_list.push('(' + expression + ') ' + order_sql);
		entry_position += 1;
	}

	const unique_prefix = index_definition.unique ? 'UNIQUE ' : '';
	const sql_text =
		'CREATE ' + unique_prefix + 'INDEX IF NOT EXISTS ' + index_identifier +
		' ON ' + table_identifier + ' (' + expression_list.join(', ') + ');';

	await sql_runner(sql_text, [], connection);
}

function assert_sql_safe_index_definition(index_definition) {
	assert_condition(is_object(index_definition), 'index_definition must be an object');
	assert_condition(index_definition.using === 'gin' || index_definition.using === 'btree', 'index_definition.using must be "gin" or "btree"');

	if(index_definition.name !== undefined) {
		assert_identifier(index_definition.name, 'index_definition.name');
	}

	if(index_definition.using === 'gin') {
		assert_condition(is_string(index_definition.path), 'index_definition.path must be a string when using is "gin"');
		assert_path(index_definition.path, 'index path');
		return;
	}

	const has_single_path = is_string(index_definition.path);
	const has_multiple_paths = is_object(index_definition.paths) && Object.keys(index_definition.paths).length > 0;

	assert_condition(has_single_path || has_multiple_paths, 'index_definition.path or index_definition.paths is required when using is "btree"');

	if(has_single_path) {
		assert_path(index_definition.path, 'index path');
	}

	if(has_multiple_paths) {
		for(const path_value of Object.keys(index_definition.paths)) {
			assert_path(path_value, 'index path');
		}
	}
}

function resolve_index_name(table_name, data_column, index_definition) {
	if(index_definition.name) {
		return index_definition.name;
	}

	if(index_definition.using === 'gin') {
		const path_suffix = index_definition.path.replace(/\./g, '_');
		return build_index_name(table_name, data_column, path_suffix + '_gin');
	}

	const btree_path_order_map = build_btree_path_order_map(index_definition);
	const index_entries = Object.entries(btree_path_order_map);
	const path_suffix_parts = [];
	let entry_position = 0;

	while(entry_position < index_entries.length) {
		const index_entry = index_entries[entry_position];
		const path_value = index_entry[0];
		const order_value = index_entry[1];
		const order_suffix = order_value === -1 ? 'desc' : 'asc';
		path_suffix_parts.push(path_value.replace(/\./g, '_') + '_' + order_suffix);
		entry_position += 1;
	}

	return build_index_name(table_name, data_column, path_suffix_parts.join('_') + '_btree');
}

function build_btree_path_order_map(index_definition) {
	if(is_object(index_definition.paths)) {
		const path_entries = Object.entries(index_definition.paths);

		if(path_entries.length > 0) {
			return Object.assign({}, index_definition.paths);
		}
	}

	return {
		[index_definition.path]: index_definition.order
	};
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

export default ensure_index;
