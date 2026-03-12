import Document from '#src/model/document.js';
import {DocumentInputMode} from '#src/model/factory/constants.js';
import {conform_payload_to_schema, filter_loose_payload, normalize_document_input} from '#src/model/factory/document-builder.js';

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

/**
 * Build a new document from external input.
 *
 * @param {*} input_data
 * @param {object} [options]
 * @returns {object}
 */
Model.from = function (input_data, options = {}) {
	const model = this;
	const schema = model.schema;

	// 1. Inspect the incoming shape, extract root fields, and fold everything else into data.
	const doc = normalize_document_input(input_data, DocumentInputMode.From);

	// 2. Resolve strictness for this import. Per-call options override schema strictness here too.
	const strict_mode = options.strict ?? schema.strict;

	// 3. Shape the extracted data according to the selected strictness rule.
	doc.data = strict_mode ? conform_payload_to_schema(schema, doc.data) : filter_loose_payload(doc.data);

	// 4. Validate and cast the resulting data through the schema.
	doc.data = schema.validate(doc.data);

	// 5. Build a new document. This path keeps create semantics and leaves `is_new = true`.
	return new model(doc, options);
};

/**
 * Build a persisted document from row-like input.
 *
 * @param {*} input_data
 * @param {object} [options]
 * @returns {object}
 */
Model.hydrate = function (input_data, options = {}) {
	const model = this;
	const schema = model.schema;

	// 1. Inspect the incoming shape, extract outer root fields, and use `input_data.data` as data when present.
	const doc = normalize_document_input(input_data, DocumentInputMode.Hydrate);

	// 2. Resolve strictness for this hydrate input. Per-call options override schema strictness here too.
	const strict_mode = options.strict ?? schema.strict;

	// 3. Shape the extracted data according to the selected strictness rule.
	doc.data = strict_mode ? conform_payload_to_schema(schema, doc.data) : filter_loose_payload(doc.data);

	// 4. Validate and cast the resulting data through the schema.
	doc.data = schema.validate(doc.data);

	// 5. Build a persisted document. This path reconstructs row-backed state and sets `is_new = false`.
	return new model().init(doc, options);
};

/*
 * RUNTIME BOOKKEEPING
 */
Model.reset_index_cache = function () {};

/*
 * PERSISTENCE WRITES
 */
Model.create = async function (documents) {
	void documents;
};

Model.update_one = async function (query_filter, update_definition) {
	void query_filter;
	void update_definition;
};

Model.delete_one = async function (query_filter) {
	void query_filter;
};

/*
 * SCHEMA / MIGRATION
 */
Model.ensure_table = async function () {};

Model.ensure_index = async function (index_definition) {
	void index_definition;
};

Model.ensure_schema = async function () {};

/*
 * QUERY READS
 */
Model.find = function (query_filter) {
	void query_filter;
};

Model.find_one = function (query_filter) {
	void query_filter;
};

Model.find_by_id = function (id_value) {
	void id_value;
};

Model.count_documents = async function (query_filter) {
	void query_filter;
};

export default Model;
