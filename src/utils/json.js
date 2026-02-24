function jsonb_bigint_replacer(key, value) {
	if(typeof value === 'bigint') {
		return value.toString();
	}

	return value;
}

function jsonb_stringify(value) {
	return JSON.stringify(value, jsonb_bigint_replacer);
}

export {
	jsonb_stringify,
	jsonb_bigint_replacer
};

export default {
	jsonb_stringify,
	jsonb_bigint_replacer
};
