/**
 * Deprecated placeholder for the legacy document-instance runtime.
 *
 * Production code no longer uses this module. The remaining items below are
 * the feature candidates that have not been ported into `document.js` /
 * `model.js` yet.
 */
const pending_document_instance_features = Object.freeze([
	'document serialization helpers: $serialize, to_json, toJSON',
	'alias and schema-root property proxies',
	'schema-defined prototype method installation',
	'path-oriented dirty APIs: mark_modified, is_modified, clear_modified',
	'instance delete convenience wrapper'
]);

/**
 * Return the remaining legacy feature backlog for document-instance parity.
 *
 * @returns {string[]}
 */
function document_instance() {
	return pending_document_instance_features;
}

export {
	pending_document_instance_features
};

export default document_instance;
