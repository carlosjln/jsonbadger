import {read_nested_path, split_dot_path, write_nested_path} from '#src/utils/object-path.js';

/**
 * Create one document instance from normalized state.
 *
 * @param {object} [data]
 * @returns {Document}
 */
function Document(data = {}) {
	Object.assign(this, data);
}

Document.prototype.id = null;
Document.prototype.created_at = null;
Document.prototype.updated_at = null;

/**
 * Apply one state object onto this document.
 *
 * @param {object} [data]
 * @returns {Document}
 */
Document.prototype.init = function (data = {}) {
	Object.assign(this, data);

	return this;
};

/**
 * Read one document value by path.
 *
 * @param {string} path_name
 * @returns {*}
 */
Document.prototype.get = function (path_name) {
	const path_segments = split_dot_path(path_name);
	const path_state = read_nested_path(this, path_segments);

	if(!path_state.exists) {
		return undefined;
	}

	return path_state.value;
};

/**
 * Set one document value by path.
 *
 * @param {string} path
 * @param {*} value
 * @returns {Document}
 */
Document.prototype.set = function (path, value) {
	const path_segments = split_dot_path(path);
	write_nested_path(this, path_segments, value);

	return this;
};

export default Document;
