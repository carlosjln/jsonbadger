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
	if(value === null || value === undefined) {
		return true;
	}

	const numeric_value = Number(value);
	return Number.isNaN(numeric_value);
}

/**
 * Normalizes one value into a finite number, falling back to zero.
 *
 * @param {*} value Value to normalize.
 * @returns {number}
 */
function to_number(value) {
	const number = Number(value || 0);
	return Number.isFinite(number) ? number : 0;
}

function to_int(value) {
	return Math.floor(Number(value));
}

/**
 * Checks whether one value is a valid UUIDv7 string.
 *
 * @param {*} value Value to inspect.
 * @returns {boolean}
 */
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

function is_date(value) {
	return value instanceof Date;
}

function is_not_date(value) {
	return !(value instanceof Date);
}

function is_valid_timestamp(value) {
	return !Number.isNaN(new Date(value).getTime());
}

function to_iso_timestamp(value) {
	// Treat falsy values as non-normalizable input and return them unchanged
	// rather than assuming they represent a valid timestamp.
	if(!value) {
		return null;
	}

	if(value instanceof Date) {
		return value.toISOString();
	}

	const parsed_timestamp = new Date(value);

	if(Number.isNaN(parsed_timestamp.getTime())) {
		return String(value);
	}

	return parsed_timestamp.toISOString();
}

/**
 * Returns the value if the evaluator passes, otherwise returns the default.
 * @param {function} evaluator - The condition to check against.
 * @param {any} value - The primary value to test.
 * @param {any} default_value - The fallback value.
 * @returns {any}
 */
function get_if(evaluator, value, default_value) {
	if(evaluator(value)) {
		return value;
	}

	return default_value;
}

export {
	is_object,
	is_plain_object,
	is_not_object,
	is_nan,
	is_uuid_v7,
	to_int,
	to_number,
	is_string,
	is_function,
	is_boolean,
	is_date,
	is_not_date,
	is_valid_timestamp,
	to_iso_timestamp,
	get_if
};

export default {
	is_object,
	is_plain_object,
	is_not_object,
	is_nan,
	is_uuid_v7,
	to_int,
	to_number,
	is_string,
	is_function,
	is_boolean,
	is_date,
	is_not_date,
	is_valid_timestamp,
	to_iso_timestamp,
	get_if
};
