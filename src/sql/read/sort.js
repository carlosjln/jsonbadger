/*
 * MODULE RESPONSIBILITY
 * Compile ORDER BY clauses for read queries.
 */
import QueryError from '#src/errors/query-error.js';
import {quote_identifier} from '#src/utils/assert.js';
import {has_own} from '#src/utils/object.js';
import {build_text_expression} from '#src/sql/read/path-parser.js';
import {split_dot_path} from '#src/utils/object-path.js';

const base_field_sort_columns = Object.freeze({
	id: '"id"',
	created_at: '"created_at"',
	updated_at: '"updated_at"'
});

/**
 * Compiles a sort object into a SQL ORDER BY clause.
 *
 * Supported shape:
 * - keys: field paths (e.g. `name`, `profile.last_name`, `created_at`)
 * - values: order hints (`-1` => DESC, any other value => ASC)
 *
 * Returns an empty string for missing/invalid sort definitions so callers can
 * safely append the result to a larger SQL fragment.
 */
function sort_compiler(sort_definition, compile_options) {
	if(!sort_definition || typeof sort_definition !== 'object') {
		return '';
	}

	const data_column_name = compile_options?.data_column ?? 'data';
	const data_column_reference = quote_identifier(data_column_name);
	const sort_entries = Object.entries(sort_definition);
	const sort_clauses = [];
	let entry_index = 0;

	while(entry_index < sort_entries.length) {
		const sort_entry = sort_entries[entry_index];
		const path_value = sort_entry[0];
		// Keep sort order normalization permissive: only exact -1 maps to DESC.
		const order_value = Number(sort_entry[1]) === -1 ? 'DESC' : 'ASC';
		const text_expression = resolve_sort_expression(path_value, data_column_reference);

		sort_clauses.push(text_expression + ' ' + order_value);
		entry_index += 1;
	}

	if(sort_clauses.length === 0) {
		return '';
	}

	return ' ORDER BY ' + sort_clauses.join(', ');
}

/**
 * Resolves a sort path to the SQL expression used in ORDER BY.
 *
 * Base fields (`id`, `created_at`, `updated_at`) are mapped to
 * dedicated table columns instead of JSON path lookups. These fields are
 * intentionally restricted to top-level usage only: `created_at` is valid,
 * but `created_at.anything` is rejected.
 *
 * Non-base-field paths are treated as JSON data paths and may be dotted.
 */
function resolve_sort_expression(path_value, data_column_reference) {
	const path_segments = split_dot_path(path_value);
	const root_path = path_segments[0];

	if(has_own(base_field_sort_columns, root_path)) {
		// Prevent ambiguity: base-field columns do not support dotted access.
		if(path_segments.length > 1) {
			throw new QueryError('Base fields only support top-level sort paths', {
				path: path_value,
				field: root_path
			});
		}

		return base_field_sort_columns[root_path];
	}

	return build_text_expression(data_column_reference, path_value);
}

export default sort_compiler;
