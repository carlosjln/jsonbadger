import Document from '#src/model/document.js';

/**
 * Base model constructor that initializes through Document.
 *
 * @param {*} data
 * @param {object} [options]
 * @returns {void}
 */
function Model(data, options = {}) {
	Document.call(this, {data: data || {}}, options);
}

Object.setPrototypeOf(Model.prototype, Document.prototype);

export default Model;
