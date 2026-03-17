import sql from '#src/sql/index.js';
import where_compiler from '#src/query/where-compiler/index.js';
import {create_parameter_state} from '#src/sql/parameter-binder.js';

import {quote_identifier} from '#src/utils/assert.js';
import {assert_supported_update_definition, normalize_update_operator_entries} from '#src/model/factory/update-helpers.js';

/**
 * Execute Model.update_one() for a model constructor.
 *
 * @param {Function} model Model constructor.
 * @param {object|undefined} query_filter Query filter.
 * @param {object|undefined} update_definition Update definition.
 * @returns {Promise<object|null>}
 */
async function exec_update_one(model, query_filter, update_definition) {
	const schema = model.schema;
	const id_strategy = schema.id_strategy;
	const model_options = model.options;
	const data_column = model_options.data_column;
	const table_name = model_options.table_name;
	const update_operator_entries = normalize_update_operator_entries(update_definition);

	assert_supported_update_definition(update_definition, update_operator_entries);

	const table_identifier = quote_identifier(table_name);
	const data_identifier = quote_identifier(data_column);
	const where_result = where_compiler(query_filter, {schema, data_column, id_strategy});
	const parameter_state = create_parameter_state(where_result.next_index);
	const update_expression = build_update_expression(update_operator_entries, data_identifier, parameter_state, schema);

	const query_context = {
		model,
		table_identifier,
		data_identifier,
		where_result,
		parameter_state,
		update_expression
	};

	const update_query = sql.build_update_query(query_context);
	const query_result = await sql.run(update_query.sql_text, update_query.sql_params, model.connection);
	const rows = query_result.rows;
	const row = rows.length ? rows[0] : null;

	if(row) {
		return model.hydrate(row);
	}

	return null;
}

function build_update_expression(update_operator_entries, data_expression, parameter_state, schema) {
	const update_expression = {data_expression, timestamp_set: {}};

	for(const update_operator_entry of update_operator_entries) {
		const operator_result = update_operator_entry.operator_descriptor.apply({
			definition: update_operator_entry.definition,
			data_expression: update_expression.data_expression,
			parameter_state,
			schema
		});

		update_expression.data_expression = operator_result.data_expression;

		if(operator_result.timestamp_set) {
			Object.assign(update_expression.timestamp_set, operator_result.timestamp_set);
		}
	}

	return update_expression;
}

export {
	exec_update_one
};
