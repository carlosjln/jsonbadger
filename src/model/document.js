/**
 * Document instance constructor.
 *
 * @param {object} document_state
 * @param {object} document_state.data
 * @param {*} document_state.id
 * @param {*} document_state.created_at
 * @param {*} document_state.updated_at
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
 * @param {object} persisted_input Persisted row-like input.
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

export default Document;
