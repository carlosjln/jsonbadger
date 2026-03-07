function is_object(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
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

function is_not_object(value) {
	return value === null || Array.isArray(value) || typeof value !== 'object';
}

function is_nan(value) {
	const numeric_value = Number(value);
	return Number.isNaN(numeric_value);
}

function is_string(value) {
	return typeof value === 'string';
}

export {
	is_object,
	is_plain_object,
	is_not_object,
	is_nan,
	is_string
};

export default {
	is_object,
	is_plain_object,
	is_not_object,
	is_nan,
	is_string
};
