/**
 * Converts a singular identifier into a simple plural form.
 *
 * @param {*} value Source value to pluralize.
 * @returns {string}
 */
function pluralize(value) {
	const text = String(value).toLowerCase();

	if(text.endsWith('y') && text.length > 1 && !is_vowel(text[text.length - 2])) {
		return text.slice(0, -1) + 'ies';
	}

	if(
		text.endsWith('s') ||
		text.endsWith('x') ||
		text.endsWith('z') ||
		text.endsWith('ch') ||
		text.endsWith('sh')
	) {
		return text + 'es';
	}

	return text + 's';
}

/**
 * Checks whether a character is a vowel.
 *
 * @param {string} character_value Single character.
 * @returns {boolean}
 */
function is_vowel(character_value) {
	return character_value === 'a' || character_value === 'e' || character_value === 'i' || character_value === 'o' || character_value === 'u';
}

export {
	pluralize
};

export default {
	pluralize
};
