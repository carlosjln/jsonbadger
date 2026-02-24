export function safe_json_stringify(value) {
	try {
		return JSON.stringify(value);
	} catch(error) {
		return '"[unserializable]"';
	}
}

export default safe_json_stringify;
