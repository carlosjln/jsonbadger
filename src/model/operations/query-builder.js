/*
 * MODULE RESPONSIBILITY
 * Own model-facing query state, execution dispatch, and row hydration for read operations.
 */
import build_count_query from '#src/sql/read/build-count-query.js';
import build_find_query from '#src/sql/read/build-find-query.js';
import where_compiler from '#src/sql/read/where/index.js';

import run from '#src/sql/run.js';

import {assert_condition, quote_identifier} from '#src/utils/assert.js';
import {is_object, to_iso_timestamp} from '#src/utils/value.js';

function QueryBuilder(model, operation, query_filter) {
	assert_condition(model, 'QueryBuilder requires model');
	assert_condition(model.schema, 'QueryBuilder requires model.schema');
	assert_condition(model.options, 'QueryBuilder requires model.options');

	this.connection = model.connection || null;
	this.model = model;
	this.operation = operation;
	this.base_filter = query_filter || {};
	this.where_filter = {};
	this.sort_filter = null;
	this.limit_count = null;
	this.skip_count = null;
}

QueryBuilder.prototype.where = function (extra_filter) {
	this.where_filter = Object.assign({}, this.where_filter, extra_filter || {});
	return this;
};

QueryBuilder.prototype.sort = function (sort_filter) {
	this.sort_filter = sort_filter || null;
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
	// rows become document instances through `model.hydrate(...)`.
	const schema = this.model.schema;
	const id_strategy = schema.id_strategy;
	const model_options = this.model.options;

	const table_name = model_options.table_name;
	const data_column = model_options.data_column;

	const table_identifier = quote_identifier(table_name);
	const data_identifier = quote_identifier(data_column);
	const limit_count = this.operation === 'find_one' ? 1 : this.limit_count;

	const merged_filter = Object.assign({}, this.base_filter, this.where_filter);
	const where_result = where_compiler(merged_filter, {schema, data_column, id_strategy});
	const query_context = {
		connection: this.connection,
		table_identifier,
		data_identifier,
		data_column,
		where_result,
		sort: this.sort_filter,
		limit_count,
		skip_count: this.skip_count
	};

	const model = this.model;

	switch(this.operation) {
		case 'count_documents': {
			return exec_count_documents(query_context);
		}

		case 'find_one': {
			const rows = await exec_find_query(query_context);
			return rows.length ? model.hydrate(row_to_document(rows[0])) : null;
		}

		case 'find': {
			const rows = await exec_find_query(query_context);
			const documents = [];

			for(const row of rows) {
				documents.push(model.hydrate(row_to_document(row)));
			}

			return documents;
		}

		default: {
			throw new Error('Unsupported query operation: ' + this.operation);
		}
	}
};

function row_to_document(row) {
	return {
		id: row.id != null ? String(row.id) : null,
		data: is_object(row.data) ? row.data : {},
		created_at: to_iso_timestamp(row.created_at),
		updated_at: to_iso_timestamp(row.updated_at)
	};
}

async function exec_count_documents(query_context) {
	const count_query = build_count_query(query_context);
	const count_result = await run(count_query.sql_text, count_query.sql_params, query_context.connection);
	const rows = count_result.rows;

	if(rows.length === 0) {
		return 0;
	}

	return Number(rows[0].total_count);
}

async function exec_find_query(query_context) {
	const find_query = build_find_query(query_context);
	const query_result = await run(find_query.sql_text, find_query.sql_params, query_context.connection);
	return query_result.rows;
}

export default QueryBuilder;
