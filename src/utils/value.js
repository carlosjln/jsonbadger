const is_object = (value) => {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
};

const is_not_object = (value) => {
	return value === null || Array.isArray(value) || typeof value !== 'object';
};

const is_nan = (value) => {
	const numeric_value = Number(value);
	return Number.isNaN(numeric_value);
};

const is_string = (value) => {
	return typeof value === 'string';
};

export {
	is_object,
	is_not_object,
	is_nan,
	is_string
};

export default {
	is_object,
	is_not_object,
	is_nan,
	is_string
};
