const uuidv7_pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function is_object(value) {
	return typeof value === 'object'
		&& !(value == null)
		&& !(value instanceof Date)
		&& !(value instanceof Map)
		&& !(value instanceof Set)
		&& !Array.isArray(value)
		&& !ArrayBuffer.isView(value);
}

function is_not_object(value) {
	return typeof value !== 'object'
		|| value == null
		|| value instanceof Date
		|| value instanceof Map
		|| value instanceof Set
		|| Array.isArray(value)
		|| ArrayBuffer.isView(value);
}

/**
 * Checks whether a value is a plain object with a null or default object prototype.
 *
 * @param {*} value Value to inspect.
 * @returns {boolean}
 */
function is_plain_object(value) {
	if(!is_object(value)) {
		return false;
	}

	const prototype_value = Object.getPrototypeOf(value);
	return prototype_value === Object.prototype || prototype_value === null;
}

function is_nan(value) {
	const numeric_value = Number(value);
	return Number.isNaN(numeric_value);
}

function to_number(value) {
	const number = Number(value || 0);
	return Number.isFinite(number) ? number : 0;
}

function is_uuid_v7(value) {
	if(typeof value !== 'string') {
		return false;
	}

	return uuidv7_pattern.test(value);
}

function is_string(value) {
	return typeof value === 'string';
}

function is_function(value) {
	return typeof value === 'function';
}

function is_boolean(value) {
	return typeof value === 'boolean';
}

export {
	is_object,
	is_plain_object,
	is_not_object,
	is_nan,
	is_uuid_v7,
	to_number,
	is_string,
	is_function,
	is_boolean
};

export default {
	is_object,
	is_plain_object,
	is_not_object,
	is_nan,
	is_uuid_v7,
	to_number,
	is_string,
	is_function,
	is_boolean
};
