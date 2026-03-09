import where_compiler from '#src/query/where-compiler/index.js';

import {bind_parameter, create_parameter_state} from '#src/sql/parameter-binder.js';
import sql_runner from '#src/sql/sql-runner.js';

import {quote_identifier} from '#src/utils/assert.js';
import {has_own} from '#src/utils/object.js';

import {
	assert_supported_update_definition,
} from '#src/model/factory/update-helpers.js';
import {resolve_update_operator_entries} from '#src/model/factory/update-operators.js';

/**
 * Compiles and executes Model.update_one() for a model constructor.
 *
 * @param {Function} Model Model constructor.
 * @param {object} schema_instance Schema instance.
 * @param {object} model_options Model options.
 * @param {object|undefined} query_filter Query filter.
 * @param {object|undefined} update_definition Update definition.
 * @returns {Promise<object|null>}
 */
async function compile_update_one(Model, schema_instance, model_options, query_filter, update_definition) {
	const update_operator_entries = resolve_update_operator_entries(update_definition);

	assert_supported_update_definition(update_operator_entries);

	await Model.ensure_table();

	const table_identifier = quote_identifier(model_options.table_name);
	const data_identifier = quote_identifier(model_options.data_column);
	const where_result = where_compiler(query_filter || {}, {
		data_column: model_options.data_column,
		schema: schema_instance,
		id_strategy: Model.resolve_id_strategy()
	});

	const parameter_state = create_parameter_state(where_result.next_index);
	const apply_result = apply_update_operator_entries(update_operator_entries, data_identifier, parameter_state, schema_instance);
	const data_expression = apply_result.data_expression;
	const row_update_assignments = [
		data_identifier + ' = ' + data_expression
	];

	if(has_own(apply_result.timestamp_set, 'created_at')) {
		const created_at_placeholder = bind_parameter(parameter_state, apply_result.timestamp_set.created_at);
		row_update_assignments.push('created_at = ' + created_at_placeholder + '::timestamptz');
	}

	if(has_own(apply_result.timestamp_set, 'updated_at')) {
		const updated_at_placeholder = bind_parameter(parameter_state, apply_result.timestamp_set.updated_at);
		row_update_assignments.push('updated_at = ' + updated_at_placeholder + '::timestamptz');
	} else {
		row_update_assignments.push('updated_at = NOW()');
	}

	const sql_text =
		'WITH target_row AS (' + 'SELECT id FROM ' + table_identifier + ' WHERE ' + where_result.sql + ' LIMIT 1' + ') ' +
		'UPDATE ' + table_identifier + ' AS target_table ' +
		'SET ' + row_update_assignments.join(', ') + ' ' +
		'FROM target_row ' +
		'WHERE target_table.id = target_row.id ' +
		'RETURNING target_table.id::text AS id, ' +
		'target_table.' + data_identifier + ' AS data, ' +
		'target_table.created_at AS created_at, ' +
		'target_table.updated_at AS updated_at';

	const sql_params = where_result.params.concat(parameter_state.params);
	const query_result = await sql_runner(sql_text, sql_params, Model.connection);

	if(query_result.rows.length === 0) {
		return null;
	}

	return Model.create_document_from_row(query_result.rows[0]);
}

/**
 * Applies resolved update operator entries in registry order.
 *
 * @param {Array<{definition: *, operator_descriptor: object}>} update_operator_entries Resolved operator entries.
 * @param {string} data_expression Initial JSONB expression.
 * @param {object} parameter_state SQL parameter state.
 * @param {object} schema_instance Schema instance.
 * @returns {{data_expression: string, timestamp_set: object}}
 */
function apply_update_operator_entries(update_operator_entries, data_expression, parameter_state, schema_instance) {
	const apply_result = {
		data_expression: data_expression,
		timestamp_set: {}
	};

	for(const update_operator_entry of update_operator_entries) {
		const operator_apply_result = update_operator_entry.operator_descriptor.apply({
			data_expression: apply_result.data_expression,
			definition: update_operator_entry.definition,
			parameter_state: parameter_state,
			schema_instance: schema_instance
		});

		apply_result.data_expression = operator_apply_result.data_expression;

		if(operator_apply_result.timestamp_set) {
			Object.assign(apply_result.timestamp_set, operator_apply_result.timestamp_set);
		}
	}

	return apply_result;
}

export {
	compile_update_one
};
