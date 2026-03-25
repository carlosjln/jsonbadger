import sql from '#src/sql/index.js';
import where_compiler from '#src/query/where-compiler/index.js';
import {create_parameter_state} from '#src/sql/parameter-binder.js';

import {JsonbOps} from '#src/sql/jsonb-ops.js';
import {quote_identifier} from '#src/utils/assert.js';
import {timestamp_fields} from '#src/model/factory/constants.js';
import {is_not_object, is_object} from '#src/utils/value.js';

/**
 * Execute Model.update_one() by coordinating syntax parsing and SQL generation.
 */
async function exec_update_one(model, query_filter, update_definition) {
	if(is_not_object(update_definition) || Object.keys(update_definition).length === 0) {
		return null;
	}

	const model_options = model.options;
	const data_column = model_options.data_column;

	// 1. Domain Split: Separate row columns from JSON payload
	const {timestamp_set, payload} = split_update_definition(update_definition);

	// 2. Syntax Pass: Build the JsonbOps instance
	const data_identifier = quote_identifier(data_column);
	const jsonb_ops = JsonbOps.from(payload, {
		column_name: data_identifier,
		coalesce: true
	});

	// 3. State Pass: Setup binders and filters
	const where_result = where_compiler(query_filter, {
		schema: model.schema,
		data_column,
		id_strategy: model.schema.id_strategy
	});
	const parameter_state = create_parameter_state(where_result.next_index);

	const query_context = {
		model,
		table_identifier: quote_identifier(model_options.table_name),
		data_identifier,
		where_result,
		parameter_state,
		update_expression: {
			jsonb_ops,
			timestamp_set
		}
	};

	// 4. Execution
	const update_query = sql.build_update_query(query_context);
	const query_result = await sql.run(update_query.sql_text, update_query.sql_params, model.connection);
	const row = query_result.rows.length ? query_result.rows[0] : null;

	if(row) {
		return model.hydrate(row);
	}

	return null;
}

// TODO: review who calls this, it might be deprecated depending on what payload actually gets here
function split_update_definition(update_definition) {
	const timestamp_set = {};
	const payload = {...update_definition};

	for(const key of timestamp_fields) {
		if(Object.prototype.hasOwnProperty.call(payload, key)) {
			timestamp_set[key] = payload[key];
			delete payload[key];
		}
	}

	if(is_object(payload.$set)) {
		const set_payload = {...payload.$set};
		for(const key of timestamp_fields) {
			if(Object.prototype.hasOwnProperty.call(set_payload, key)) {
				timestamp_set[key] = set_payload[key];
				delete set_payload[key];
			}
		}
		payload.$set = set_payload;
	}

	if(is_object(payload.set)) {
		const set_payload = {...payload.set};
		for(const key of timestamp_fields) {
			if(Object.prototype.hasOwnProperty.call(set_payload, key)) {
				timestamp_set[key] = set_payload[key];
				delete set_payload[key];
			}
		}
		payload.set = set_payload;
	}

	return {timestamp_set, payload};
}

export {
	exec_update_one
};
