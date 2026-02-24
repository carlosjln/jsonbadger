const identifier_pattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const path_pattern = /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*$/;

export function assert_condition(condition_value, message) {
	if(!condition_value) {
		throw new Error(message || 'Assertion failed');
	}
}

export function assert_identifier(identifier_value, label) {
	const label_value = label || 'identifier';

	assert_condition(typeof identifier_value === 'string', label_value + ' must be a string');
	assert_condition(identifier_pattern.test(identifier_value), label_value + ' has invalid characters');
}

export function assert_path(path_value, label) {
	const label_value = label || 'path';

	assert_condition(typeof path_value === 'string', label_value + ' must be a string');
	assert_condition(path_pattern.test(path_value), label_value + ' has invalid characters');
}

export function quote_identifier(identifier_value) {
	assert_identifier(identifier_value, 'identifier');
	return '"' + identifier_value + '"';
}
