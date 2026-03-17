import sql_runner from '#src/sql/sql-runner.js';
import where_compiler from '#src/query/where-compiler/index.js';
import {bind_parameter, create_parameter_state} from '#src/sql/parameter-binder.js';

import {has_own} from '#src/utils/object.js';
import {quote_identifier} from '#src/utils/assert.js';
import {assert_supported_update_definition, normalize_update_operator_entries} from '#src/model/factory/update-helpers.js';

/**
 * Compiles and executes Model.update_one() for a model constructor.
 *
 * @param {Function} model Model constructor.
 * @param {object|undefined} query_filter Query filter.
 * @param {object|undefined} update_definition Update definition.
 * @returns {Promise<object|null>}
 */
async function compile_update_one(model, query_filter, update_definition) {
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
	const update_expression = create_update_expression(update_operator_entries, data_identifier, parameter_state, schema);

	const query_context = {
		model,
		table_identifier,
		data_identifier,
		where_result,
		parameter_state,
		update_expression
	};

	const row = await exec_update_query(query_context);

	if(row) {
		return model.hydrate(row);
	}

	return null;
}

function create_update_expression(update_operator_entries, data_expression, parameter_state, schema) {
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

function create_update_assignments(query_context) {
	const update_assignments = [query_context.data_identifier + ' = ' + query_context.update_expression.data_expression];
	const timestamp_set = query_context.update_expression.timestamp_set;
	const parameter_state = query_context.parameter_state;

	if(has_own(timestamp_set, 'created_at')) {
		const created_at_placeholder = bind_parameter(parameter_state, timestamp_set.created_at);
		update_assignments.push('created_at = ' + created_at_placeholder + '::timestamptz');
	}

	if(has_own(timestamp_set, 'updated_at')) {
		const updated_at_placeholder = bind_parameter(parameter_state, timestamp_set.updated_at);
		update_assignments.push('updated_at = ' + updated_at_placeholder + '::timestamptz');
	} else {
		update_assignments.push('updated_at = NOW()');
	}

	return update_assignments;
}

async function exec_update_query(query_context) {
	const update_assignments = create_update_assignments(query_context);
	const sql_text =
		'WITH target_row AS (' + 'SELECT id FROM ' + query_context.table_identifier + ' WHERE ' +
		query_context.where_result.sql + ' LIMIT 1' + ') ' +
		'UPDATE ' + query_context.table_identifier + ' AS target_table ' +
		'SET ' + update_assignments.join(', ') + ' ' +
		'FROM target_row ' +
		'WHERE target_table.id = target_row.id ' +
		'RETURNING target_table.id::text AS id, ' +
		'target_table.' + query_context.data_identifier + ' AS data, ' +
		'target_table.created_at AS created_at, ' +
		'target_table.updated_at AS updated_at';
	const sql_params = query_context.where_result.params.concat(query_context.parameter_state.params);
	const query_result = await sql_runner(sql_text, sql_params, query_context.model.connection);
	const rows = query_result.rows;

	if(rows.length) {
		return rows[0];
	}

	return null;
}

export {
	compile_update_one
};
