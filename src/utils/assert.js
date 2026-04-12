const identifier_pattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const path_pattern = /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*$/;

/**
 * Throw when the provided condition is truthy.
 *
 * @param {*} condition_value
 * @param {string} [message]
 * @returns {void}
 * @throws {Error}
 */
function assert(condition_value, message) {
	if(condition_value) {
		throw new Error(message || 'Assertion failed');
	}
}

/**
 * Assert that one SQL identifier candidate is valid.
 *
 * @param {*} identifier_value
 * @param {string} [label]
 * @returns {void}
 * @throws {Error}
 */
function assert_identifier(identifier_value, label) {
	const label_value = label || 'identifier';

	assert(!(typeof identifier_value === 'string'), label_value + ' must be a string');
	assert(!identifier_pattern.test(identifier_value), label_value + ' has invalid characters');
}

/**
 * Assert that one dot-path candidate is valid.
 *
 * @param {*} path_value
 * @param {string} [label]
 * @returns {void}
 * @throws {Error}
 */
function assert_path(path_value, label) {
	const label_value = label || 'path';

	assert(!(typeof path_value === 'string'), label_value + ' must be a string');
	assert(!path_pattern.test(path_value), label_value + ' has invalid characters');
}

/**
 * Quote one validated SQL identifier.
 *
 * @param {string} identifier_value
 * @returns {string}
 * @throws {Error}
 */
function quote_identifier(identifier_value) {
	assert_identifier(identifier_value, 'identifier');
	return '"' + identifier_value + '"';
}

export {
	assert,
	assert_identifier,
	assert_path,
	quote_identifier
};
