import {is_nan} from '#src/utils/value.js';

export default function limit_skip_compiler(limit_value, skip_value) {
	let sql_fragment = '';

	if(is_valid_integer(limit_value)) {
		sql_fragment += ' LIMIT ' + normalize_integer(limit_value);
	}

	if(is_valid_integer(skip_value)) {
		sql_fragment += ' OFFSET ' + normalize_integer(skip_value);
	}

	return sql_fragment;
}

function is_valid_integer(value) {
	if(value === null || value === undefined) {
		return false;
	}

	if(is_nan(value)) {
		return false;
	}

	return Number(value) >= 0;
}

function normalize_integer(value) {
	return Math.floor(Number(value));
}
