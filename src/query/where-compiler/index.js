import {create_parameter_state} from '#src/sql/parameter-binder.js';

import {create_compile_context} from '#src/query/where-compiler/context.js';
import {compile_field_clause} from '#src/query/where-compiler/field-clause.js';

function where_compiler(query_filter, compile_options, start_index) {
	const filter_object = query_filter ?? {};
	const compile_context = create_compile_context(compile_options);
	const parameter_state = create_parameter_state(start_index);
	const filter_entries = Object.entries(filter_object);
	const clause_list = [];
	let entry_index = 0;

	while(entry_index < filter_entries.length) {
		const entry_pair = filter_entries[entry_index];
		const path_value = entry_pair[0];
		const comparison_value = entry_pair[1];
		const clause = compile_field_clause(path_value, comparison_value, compile_context, parameter_state);

		if(clause) {
			clause_list.push(clause);
		}

		entry_index += 1;
	}

	return {
		sql: clause_list.length > 0 ? clause_list.join(' AND ') : 'TRUE',
		params: parameter_state.params,
		next_index: parameter_state.current_index
	};
}

export default where_compiler;
