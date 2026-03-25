import {bind_parameter} from '#src/sql/parameter-binder.js';
import {has_own} from '#src/utils/object.js';

/**
 * Build one compiled update query payload.
 *
 * @param {object} query_context
 * @param {string} query_context.table_identifier
 * @param {string} query_context.data_identifier
 * @param {object} query_context.update_expression
 * @param {object} query_context.update_expression.jsonb_ops
 * @param {object} query_context.update_expression.timestamp_set
 * @param {object} query_context.parameter_state
 * @param {Array<*>} query_context.parameter_state.params
 * @param {object} query_context.where_result
 * @param {string} query_context.where_result.sql
 * @param {Array<*>} query_context.where_result.params
 * @returns {{sql_text: string, sql_params: Array<*>}}
 */
function build_update_query(query_context) {
	const {data_identifier, update_expression, parameter_state, table_identifier, where_result} = query_context;

	// Finalize the JSONB mutation expression.
	// The SQL boundary owns JSONB compilation and should compile via
	// `jsonb_ops.compile(parameter_state)` as the new contract lands.
	const compiled_data_expression = update_expression.jsonb_ops.compile(parameter_state);

	const assignments = [`${data_identifier} = ${compiled_data_expression}`];
	const timestamps = update_expression.timestamp_set;
	const params = parameter_state;

	if(has_own(timestamps, 'created_at')) {
		const created_at_param = bind_parameter(params, timestamps.created_at);
		assignments.push(`created_at = ${created_at_param}::timestamptz`);
	}

	if(has_own(timestamps, 'updated_at')) {
		const updated_at_param = bind_parameter(params, timestamps.updated_at);
		assignments.push(`updated_at = ${updated_at_param}::timestamptz`);
	} else {
		assignments.push('updated_at = NOW()');
	}

	const sql_text =
		`WITH target_row AS (SELECT id FROM ${table_identifier} WHERE ${where_result.sql} LIMIT 1) ` +
		`UPDATE ${table_identifier} AS target_table ` +
		`SET ${assignments.join(', ')} ` +
		`FROM target_row ` +
		`WHERE target_table.id = target_row.id ` +
		`RETURNING target_table.id::text AS id, ` +
		`target_table.${data_identifier} AS data, ` +
		`target_table.created_at AS created_at, ` +
		`target_table.updated_at AS updated_at`;

	const sql_params = [...where_result.params, ...parameter_state.params];

	return {
		sql_text,
		sql_params
	};
}

export default build_update_query;
