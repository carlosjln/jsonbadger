import limit_skip_compiler from '#src/query/limit-skip-compiler.js';
import sort_compiler from '#src/query/sort-compiler.js';
import where_compiler from '#src/query/where-compiler.js';

import sql_runner from '#src/sql/sql-runner.js';

import {assert_condition, quote_identifier} from '#src/utils/assert.js';
import {is_object} from '#src/utils/value.js';

const base_field_keys = new Set(['id', 'created_at', 'updated_at']);

function QueryBuilder(model_constructor, operation_name, query_filter, projection_value) {
	assert_condition(model_constructor && is_object(model_constructor.model_options), 'QueryBuilder requires model_constructor.model_options');

	this.model_constructor = model_constructor;
	this.execution_context = resolve_model_execution_context(model_constructor);
	this.operation_name = operation_name;
	this.base_filter = query_filter || {};
	this.where_filter = {};
	this.sort_definition = null;
	this.limit_count = null;
	this.skip_count = null;
	this.projection_value = projection_value || null;
}

QueryBuilder.prototype.where = function (extra_filter) {
	this.where_filter = Object.assign({}, this.where_filter, extra_filter || {});
	return this;
};

QueryBuilder.prototype.sort = function (sort_definition) {
	this.sort_definition = sort_definition || null;
	return this;
};

QueryBuilder.prototype.limit = function (limit_value) {
	this.limit_count = limit_value;
	return this;
};

QueryBuilder.prototype.skip = function (skip_value) {
	this.skip_count = skip_value;
	return this;
};

QueryBuilder.prototype.exec = async function () {
	// Query execution is the queried/hydrated lifecycle boundary for read methods:
	// rows become document instances through `create_document_from_row(...)`.
	const schema_instance = this.model_constructor.schema_instance;
	const model_options = this.model_constructor.model_options;
	const table_name = model_options.table_name;
	const data_column = model_options.data_column;
	const table_identifier = quote_identifier(table_name);
	const data_identifier = quote_identifier(data_column);
	const merged_filter = Object.assign({}, this.base_filter, this.where_filter);
	const where_result = where_compiler(merged_filter, {
		data_column: data_column,
		schema: schema_instance,
		id_strategy: resolve_model_id_strategy(this.model_constructor)
	});


	if(this.operation_name === 'count_documents') {
		const count_sql = 'SELECT COUNT(*)::int AS total_count FROM ' + table_identifier + ' WHERE ' + where_result.sql;
		const count_result = await sql_runner(count_sql, where_result.params, this.execution_context);

		if(count_result.rows.length === 0) {
			return 0;
		}

		return Number(count_result.rows[0].total_count);
	}

	let sql_text =
		'SELECT id::text AS id, ' +
		data_identifier + ' AS data, ' +
		'created_at AS created_at, ' +
		'updated_at AS updated_at ' +
		'FROM ' + table_identifier + ' WHERE ' + where_result.sql;
	const sort_sql = sort_compiler(this.sort_definition, {
		data_column: data_column
	});

	sql_text += sort_sql;

	if(this.operation_name === 'find_one') {
		if(this.limit_count === null || this.limit_count === undefined) {
			this.limit_count = 1;
		}
	}

	sql_text += limit_skip_compiler(this.limit_count, this.skip_count);

	const query_result = await sql_runner(sql_text, where_result.params, this.execution_context);

	if(this.operation_name === 'find_one') {
		if(query_result.rows.length === 0) {
			return null;
		}

		return map_query_row(this.model_constructor, query_result.rows[0]);
	}

	return query_result.rows.map(function map_row(row_value) {
		return map_query_row(this.model_constructor, row_value);
	}.bind(this));
};

function map_query_row(model_constructor, row_value) {
	if(model_constructor && typeof model_constructor.create_document_from_row === 'function') {
		return model_constructor.create_document_from_row(row_value);
	}

	return shape_query_row(row_value);
}

function shape_query_row(row_value) {
	const payload_value = is_object(row_value?.data) ? row_value.data : {};
	const output_value = {};
	const payload_entries = Object.entries(payload_value);
	let payload_index = 0;

	while(payload_index < payload_entries.length) {
		const payload_entry = payload_entries[payload_index];
		const key_value = payload_entry[0];
		const next_value = payload_entry[1];

		if(!base_field_keys.has(key_value)) {
			output_value[key_value] = next_value;
		}

		payload_index += 1;
	}

	output_value.id = row_value?.id === undefined || row_value?.id === null ? row_value?.id : String(row_value.id);
	output_value.created_at = normalize_timestamp_value(row_value?.created_at);
	output_value.updated_at = normalize_timestamp_value(row_value?.updated_at);

	return output_value;
}

function normalize_timestamp_value(timestamp_value) {
	if(timestamp_value === undefined || timestamp_value === null) {
		return timestamp_value;
	}

	if(timestamp_value instanceof Date) {
		return timestamp_value.toISOString();
	}

	const parsed_timestamp = new Date(timestamp_value);

	if(Number.isNaN(parsed_timestamp.getTime())) {
		return String(timestamp_value);
	}

	return parsed_timestamp.toISOString();
}

function resolve_model_id_strategy(model_constructor) {
	const resolve_id_strategy = model_constructor.resolve_id_strategy;

	if(typeof resolve_id_strategy === 'function') {
		return resolve_id_strategy.call(model_constructor);
	}

	return model_constructor.model_options.id_strategy ?? 'bigserial';
}

// TODO: revise if necesary after phase 5
function resolve_model_execution_context(model_constructor) {
	if(is_object(model_constructor.connection)) {
		return model_constructor.connection;
	}

	return null;
}

export default QueryBuilder;
