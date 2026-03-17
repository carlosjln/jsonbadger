import limit_skip_compiler from '#src/query/limit-skip-compiler.js';
import where_compiler from '#src/query/where-compiler/index.js';
import sort_compiler from '#src/query/sort-compiler.js';

import sql_runner from '#src/sql/sql-runner.js';

import {assert_condition, quote_identifier} from '#src/utils/assert.js';
import {is_object, to_iso_timestamp} from '#src/utils/value.js';

function QueryBuilder(model, operation, query_filter) {
	assert_condition(model, 'QueryBuilder requires model');

	this.connection = model.connection || null;
	this.model = model;
	this.operation = operation;
	this.base_filter = query_filter || {};
	this.where_filter = {};
	this.sort = null;
	this.limit_count = null;
	this.skip_count = null;
}

QueryBuilder.prototype.where = function (extra_filter) {
	this.where_filter = Object.assign({}, this.where_filter, extra_filter || {});
	return this;
};

QueryBuilder.prototype.sort = function (sort) {
	this.sort = sort || null;
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
		sort: this.sort,
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
	const count_sql = 'SELECT COUNT(*)::int AS total_count FROM ' + query_context.table_identifier + ' WHERE ' + query_context.where_result.sql;
	const count_result = await sql_runner(count_sql, query_context.where_result.params, query_context.connection);
	const rows = count_result.rows;

	if(rows.length === 0) {
		return 0;
	}

	return Number(rows[0].total_count);
}

async function exec_find_query(query_context) {
	let sql_text = 'SELECT id::text AS id, ' + query_context.data_identifier + ' AS data, ' +
		'created_at AS created_at, ' +
		'updated_at AS updated_at ' +
		'FROM ' + query_context.table_identifier +
		' WHERE ' + query_context.where_result.sql;
	const sort_sql = sort_compiler(query_context.sort, {data_column: query_context.data_column});

	sql_text += sort_sql;
	sql_text += limit_skip_compiler(query_context.limit_count, query_context.skip_count);

	const query_result = await sql_runner(sql_text, query_context.where_result.params, query_context.connection);
	return query_result.rows;
}

export default QueryBuilder;
