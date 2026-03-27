/*
 * MODULE RESPONSIBILITY
 * Iterate operator entries and compile their clause fragments.
 */
function compile_operator_entry_clauses(operator_definition, compile_operator_clause) {
	const clause_list = [];
	const operator_entries = Object.entries(operator_definition);
	let entry_index = 0;

	while(entry_index < operator_entries.length) {
		const operator_entry = operator_entries[entry_index];
		const operator_name = operator_entry[0];
		const operator_value = operator_entry[1];

		if(operator_name === '$options') {
			entry_index += 1;
			continue;
		}

		clause_list.push(compile_operator_clause(operator_name, operator_value));
		entry_index += 1;
	}

	return clause_list;
}

export {
	compile_operator_entry_clauses
};
