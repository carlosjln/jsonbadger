import {quote_identifier} from '#src/utils/assert.js';
import {build_text_expression} from '#src/query/path-parser.js';

export default function sort_compiler(sort_definition, compile_options) {
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
		const direction_value = Number(sort_entry[1]) === -1 ? 'DESC' : 'ASC';
		const text_expression = build_text_expression(data_column_reference, path_value);

		sort_clauses.push(text_expression + ' ' + direction_value);
		entry_index += 1;
	}

	if(sort_clauses.length === 0) {
		return '';
	}

	return ' ORDER BY ' + sort_clauses.join(', ');
}
