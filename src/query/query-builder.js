import limit_skip_compiler from '#src/query/limit-skip-compiler.js';
import sort_compiler from '#src/query/sort-compiler.js';
import where_compiler from '#src/query/where-compiler.js';

import sql_runner from '#src/sql/sql-runner.js';

import {quote_identifier} from '#src/utils/assert.js';

export default function QueryBuilder(model_constructor, operation_name, query_filter, projection_value) {
	this.model_constructor = model_constructor;
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
	const schema_instance = this.model_constructor.schema_instance;
	const model_options = this.model_constructor.model_options;
	const table_name = model_options.table_name;
	const data_column = model_options.data_column;
	const table_identifier = quote_identifier(table_name);
	const data_identifier = quote_identifier(data_column);
	const merged_filter = Object.assign({}, this.base_filter, this.where_filter);
	const where_result = where_compiler(merged_filter, {
		data_column: data_column,
		schema: schema_instance
	});


	if(this.operation_name === 'count_documents') {
		const count_sql = 'SELECT COUNT(*)::int AS total_count FROM ' + table_identifier + ' WHERE ' + where_result.sql;
		const count_result = await sql_runner(count_sql, where_result.params);

		if(count_result.rows.length === 0) {
			return 0;
		}

		return Number(count_result.rows[0].total_count);
	}

	let sql_text = 'SELECT ' + data_identifier + ' AS data FROM ' + table_identifier + ' WHERE ' + where_result.sql;
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

	const query_result = await sql_runner(sql_text, where_result.params);

	if(this.operation_name === 'find_one') {
		if(query_result.rows.length === 0) {
			return null;
		}

		return query_result.rows[0].data;
	}

	return query_result.rows.map(function map_row(row_value) {
		return row_value.data;
	});
};
