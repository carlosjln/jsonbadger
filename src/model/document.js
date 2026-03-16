/**
 * Create one document instance from normalized state.
 *
 * @param {object} [document_state]
 * @param {object} [options]
 * @returns {void}
 */
function Document(document_state = {}, options = {}) {
	void options;

	this.data = document_state.data || {};
	this.id = document_state.id;
	this.created_at = document_state.created_at;
	this.updated_at = document_state.updated_at;
	this.is_new = true;
}

/**
 * Apply persisted row-like state onto this document.
 *
 * @param {object} [persisted_input]
 * @param {object} [options]
 * @returns {Document}
 */
Document.prototype.init = function (persisted_input = {}, options = {}) {
	void options;

	this.data = persisted_input.data || {};
	this.id = persisted_input.id;
	this.created_at = persisted_input.created_at;
	this.updated_at = persisted_input.updated_at;
	this.is_new = false;

	return this;
};

/**
 * Return payload data without row base fields.
 *
 * @returns {object}
 */
Document.prototype.get_payload = function () {
	const payload = Object.assign({}, this.data);

	delete payload.id;
	delete payload.created_at;
	delete payload.updated_at;

	return payload;
};

/**
 * Return document timestamp base fields.
 *
 * @returns {object}
 */
Document.prototype.get_timestamps = function () {
	return {
		created_at: this.created_at,
		updated_at: this.updated_at
	};
};

export default Document;
