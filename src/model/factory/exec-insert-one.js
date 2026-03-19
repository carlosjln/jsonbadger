import IdStrategies from '#src/constants/id-strategies.js';

import sql from '#src/sql/index.js';
import {quote_identifier} from '#src/utils/assert.js';

/**
 * Execute Model.insert_one() for a model constructor.
 *
 * @param {Function} model Model constructor.
 * @param {*|object} document_value Document instance or plain input.
 * @returns {Promise<object>}
 */
async function exec_insert_one(model, document_value) {
	const model_options = model.options;
	const table_name = model_options.table_name;
	const data_column = model_options.data_column;
	const table_identifier = quote_identifier(table_name);
	const data_identifier = quote_identifier(data_column);
	const instance = document_value instanceof model ? document_value : new model(document_value);
	const document = instance.document;

	model.schema.validate(document);
	apply_insert_timestamps(document);

	const payload = instance.payload;
	const base_fields = Object.assign({}, instance.timestamps);

	if(model.schema.id_strategy === IdStrategies.uuidv7) {
		base_fields.id = instance.id;
	}

	const insert_query = sql.build_insert_query({table_identifier, data_identifier, payload, base_fields});
	const query_result = await sql.run(insert_query.sql_text, insert_query.sql_params, model.connection);
	const saved_row = query_result.rows[0];

	instance.is_new = false;
	document.init(saved_row);
	document.$rebase_dirty_fields();

	return instance;
}

/**
 * Apply insert timestamps to a document before persistence.
 *
 * @param {object} document
 * @returns {void}
 */
function apply_insert_timestamps(document) {
	const now = new Date();

	if(document.created_at === undefined || document.created_at === null) {
		document.created_at = now;
	}

	if(document.updated_at === undefined || document.updated_at === null) {
		document.updated_at = now;
	}
}

export {
	exec_insert_one
};
