import {is_nan, to_int} from '#src/utils/value.js';

function limit_skip_compiler(limit_value, skip_value) {
	let sql_fragment = '';

	if(!is_nan(limit_value)) {
		sql_fragment += ' LIMIT ' + to_int(limit_value);
	}

	if(!is_nan(skip_value)) {
		sql_fragment += ' OFFSET ' + to_int(skip_value);
	}

	return sql_fragment;
}

export default limit_skip_compiler;
