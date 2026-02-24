const is_not_array = (value) => {
	return !Array.isArray(value);
};

const is_array = (value) => {
	return Array.isArray(value);
};

const to_array = (object) => {
	if(Array.isArray(object)) {
		return object;
	}

	if(object instanceof Set) {
		return Array.from(object);
	}

	return object != null ? [object] : [];
};

export {
	to_array,
	is_array,
	is_not_array
};

export default {
	to_array,
	is_array,
	is_not_array
};
