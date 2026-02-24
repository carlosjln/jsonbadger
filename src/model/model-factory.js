import defaults from '#src/constants/defaults.js';
import QueryError from '#src/errors/query-error.js';

import {get_connection_options, get_server_capabilities, has_pool} from '#src/connection/pool-store.js';
import {assert_id_strategy_capability} from '#src/connection/server-capabilities.js';
import ensure_index from '#src/migration/ensure-index.js';
import ensure_schema from '#src/migration/ensure-schema.js';
import resolve_schema_indexes from '#src/migration/schema-indexes-resolver.js';
import ensure_table from '#src/migration/ensure-table.js';

import document_instance from '#src/model/document-instance.js';
import IdStrategies, {assert_valid_id_strategy} from '#src/constants/id-strategies.js';
import QueryBuilder from '#src/query/query-builder.js';
import where_compiler from '#src/query/where-compiler.js';

import {bind_parameter, create_parameter_state} from '#src/sql/parameter-binder.js';
import sql_runner from '#src/sql/sql-runner.js';

import {assert_condition, assert_identifier, quote_identifier} from '#src/utils/assert.js';
import {has_own} from '#src/utils/object.js';
import {build_path_literal} from '#src/utils/object-path.js';
import {jsonb_stringify} from '#src/utils/json.js';
import {is_not_object} from '#src/utils/value.js';

const update_path_root_segment_pattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const update_path_nested_segment_pattern = /^(?:[a-zA-Z_][a-zA-Z0-9_]*|[0-9]+)$/;

export default function model(schema_instance, model_configuration) {
	assert_condition(schema_instance && typeof schema_instance.validate === 'function', 'schema_instance is required');
	assert_condition(is_not_object(model_configuration) === false, 'model options are required');

	const model_options = Object.assign({}, defaults.model_options, model_configuration);
	assert_identifier(model_options.table_name, 'table_name');
	assert_identifier(model_options.data_column, 'data_column');

	let indexes_ensured = false;

	function Model(data) {
		this.data = data || {};
	}

	Model.model_name = model_options.table_name;
	Model.schema_instance = schema_instance;
	Model.model_options = model_options;
	Model.resolve_id_strategy = function () {
		const connection_options = get_connection_options();
		const model_id_strategy = model_options.id_strategy;
		const server_id_strategy = connection_options.id_strategy;
		const final_id_strategy = model_id_strategy ?? server_id_strategy;

		assert_valid_id_strategy(final_id_strategy);

		return final_id_strategy;
	};

	Model.resolve_auto_index = function () {
		const connection_options = get_connection_options();
		const model_auto_index = model_options.auto_index;
		const server_auto_index = connection_options.auto_index;
		const final_auto_index = model_auto_index ?? server_auto_index;

		assert_condition(typeof final_auto_index === 'boolean', 'auto_index must be a boolean');

		return final_auto_index;
	};

	Model.assert_id_strategy_supported = function () {
		const final_id_strategy = Model.resolve_id_strategy();
		assert_model_id_strategy_supported(final_id_strategy);
		return final_id_strategy;
	};

	document_instance(Model);

	Model.ensure_table = async function () {
		const final_table_name = model_options.table_name;
		const final_id_strategy = Model.assert_id_strategy_supported();

		await ensure_table(final_table_name, model_options.data_column, final_id_strategy);

		if(indexes_ensured || !Model.resolve_auto_index()) {
			return;
		}

		await ensure_schema_indexes(final_table_name);
		indexes_ensured = true;
	};

	Model.ensure_index = async function () {
		const final_table_name = model_options.table_name;
		const final_id_strategy = Model.assert_id_strategy_supported();

		await ensure_table(final_table_name, model_options.data_column, final_id_strategy);
		await ensure_schema_indexes(final_table_name);

		indexes_ensured = true;
	};

	Model.ensure_schema = async function () {
		const final_id_strategy = Model.assert_id_strategy_supported();
		await ensure_schema(model_options.table_name, model_options.data_column, schema_instance, final_id_strategy);
		indexes_ensured = true;
	};

	Model.find = function (query_filter, projection_value) {
		return new QueryBuilder(Model, 'find', query_filter || {}, projection_value || null);
	};

	Model.find_one = function (query_filter) {
		return new QueryBuilder(Model, 'find_one', query_filter || {}, null);
	};

	Model.count_documents = function (query_filter) {
		return new QueryBuilder(Model, 'count_documents', query_filter || {}, null);
	};

	Model.update_one = async function (query_filter, update_definition) {
		const update_object = update_definition || {};
		const set_definition = update_object.$set;
		const insert_definition = update_object.$insert;
		const set_lax_definition = update_object.$set_lax;

		assert_supported_update_definition(set_definition, insert_definition, set_lax_definition);

		await Model.ensure_table();

		const table_identifier = quote_identifier(model_options.table_name);
		const data_identifier = quote_identifier(model_options.data_column);
		const where_result = where_compiler(query_filter || {}, {
			data_column: model_options.data_column,
			schema: schema_instance
		});
		const parameter_state = create_parameter_state(where_result.next_index);
		let data_expression = data_identifier;

		data_expression = apply_set_updates(data_expression, set_definition, parameter_state);
		data_expression = apply_insert_updates(data_expression, insert_definition, parameter_state);
		data_expression = apply_set_lax_updates(data_expression, set_lax_definition, parameter_state);

		const sql_text =
			'WITH target_row AS (' + 'SELECT id FROM ' + table_identifier + ' WHERE ' + where_result.sql + ' LIMIT 1' + ') ' +
			'UPDATE ' + table_identifier + ' AS target_table ' +
			'SET ' + data_identifier + ' = ' + data_expression + ', updated_at = NOW() ' +
			'FROM target_row ' +
			'WHERE target_table.id = target_row.id ' +
			'RETURNING target_table.' + data_identifier + ' AS data';
		const sql_params = where_result.params.concat(parameter_state.params);
		const query_result = await sql_runner(sql_text, sql_params);

		if(query_result.rows.length === 0) {
			return null;
		}

		return query_result.rows[0].data;
	};

	Model.delete_one = async function (query_filter) {
		const table_identifier = quote_identifier(model_options.table_name);
		const data_identifier = quote_identifier(model_options.data_column);
		const where_result = where_compiler(query_filter || {}, {
			data_column: model_options.data_column,
			schema: schema_instance
		});

		const sql_text =
			'WITH target_row AS (' + 'SELECT id FROM ' + table_identifier + ' WHERE ' + where_result.sql + ' LIMIT 1' + ') ' +
			'DELETE FROM ' + table_identifier + ' AS target_table ' +
			'USING target_row ' +
			'WHERE target_table.id = target_row.id ' +
			'RETURNING target_table.' + data_identifier + ' AS data';
		let query_result;

		try {
			query_result = await sql_runner(sql_text, where_result.params);
		} catch(error) {
			if(is_missing_relation_query_error(error)) {
				return null;
			}

			throw error;
		}

		if(query_result.rows.length === 0) {
			return null;
		}

		return query_result.rows[0].data;
	};

	function cast_update_value(path_value, next_value) {
		const field_type = resolve_update_field_type(path_value);

		if(!field_type || typeof field_type.cast !== 'function') {
			return next_value;
		}

		let casted_value = next_value;

		if(typeof field_type.apply_set === 'function') {
			casted_value = field_type.apply_set(casted_value, {path: path_value, mode: 'update'});
		}

		return field_type.cast(casted_value, {path: path_value, mode: 'update'});
	}

	function resolve_update_field_type(path_value) {
		if(!schema_instance || typeof schema_instance.path !== 'function') {
			return null;
		}

		return schema_instance.path(path_value);
	}

	function assert_supported_update_definition(set_definition, insert_definition, set_lax_definition) {
		const has_set_updates = set_definition !== undefined;
		const has_insert_updates = insert_definition !== undefined;
		const has_set_lax_updates = set_lax_definition !== undefined;

		if(!has_set_updates && !has_insert_updates && !has_set_lax_updates) {
			throw new QueryError('update_one requires at least one supported update operator', {
				allowed: ['$set', '$insert', '$set_lax']
			});
		}

		if(has_set_updates && is_not_object(set_definition)) {
			throw new QueryError('update_definition.$set must be an object', {
				allowed: ['$set', '$insert', '$set_lax']
			});
		}

		if(has_insert_updates && is_not_object(insert_definition)) {
			throw new QueryError('update_definition.$insert must be an object', {
				allowed: ['$set', '$insert', '$set_lax']
			});
		}

		if(has_set_lax_updates && is_not_object(set_lax_definition)) {
			throw new QueryError('update_definition.$set_lax must be an object', {
				allowed: ['$set', '$insert', '$set_lax']
			});
		}

		const update_path_entries = collect_update_path_entries([
			{operator_name: '$set', definition: set_definition},
			{operator_name: '$insert', definition: insert_definition},
			{operator_name: '$set_lax', definition: set_lax_definition}
		]);

		assert_no_conflicting_update_paths(update_path_entries);
	}

	function apply_set_updates(data_expression, set_definition, parameter_state) {
		if(set_definition === undefined) {
			return data_expression;
		}

		const set_entries = Object.entries(set_definition);
		let set_index = 0;
		let next_expression = data_expression;

		while(set_index < set_entries.length) {
			const set_entry = set_entries[set_index];
			const path_value = set_entry[0];
			const next_value = set_entry[1];
			const casted_value = cast_update_value(path_value, next_value);
			const path_literal = build_update_path_literal(path_value);
			const placeholder = bind_parameter(parameter_state, jsonb_stringify(casted_value));

			next_expression = 'jsonb_set(' + next_expression + ", '" + path_literal + "', " + placeholder + '::jsonb, true)';
			set_index += 1;
		}

		return next_expression;
	}

	function apply_insert_updates(data_expression, insert_definition, parameter_state) {
		if(insert_definition === undefined) {
			return data_expression;
		}

		const insert_entries = Object.entries(insert_definition);
		let insert_index = 0;
		let next_expression = data_expression;

		while(insert_index < insert_entries.length) {
			const insert_entry = insert_entries[insert_index];
			const path_value = insert_entry[0];
			const insert_config = normalize_insert_update(path_value, insert_entry[1]);
			const casted_value = cast_update_value(path_value, insert_config.value);
			const path_literal = build_update_path_literal(path_value);
			const value_placeholder = bind_parameter(parameter_state, jsonb_stringify(casted_value));
			const insert_after_sql = insert_config.insert_after ? 'true' : 'false';

			next_expression =
				'jsonb_insert(' + next_expression + ", '" + path_literal + "', " + value_placeholder + '::jsonb, ' + insert_after_sql + ')';
			insert_index += 1;
		}

		return next_expression;
	}

	function apply_set_lax_updates(data_expression, set_lax_definition, parameter_state) {
		if(set_lax_definition === undefined) {
			return data_expression;
		}

		const set_lax_entries = Object.entries(set_lax_definition);
		let set_lax_index = 0;
		let next_expression = data_expression;

		while(set_lax_index < set_lax_entries.length) {
			const set_lax_entry = set_lax_entries[set_lax_index];
			const path_value = set_lax_entry[0];
			const set_lax_config = normalize_set_lax_update(path_value, set_lax_entry[1]);
			const casted_value = cast_update_value(path_value, set_lax_config.value);
			const path_literal = build_update_path_literal(path_value);
			const value_placeholder = bind_parameter(parameter_state, cast_update_parameter_value(casted_value));
			const create_if_missing_sql = set_lax_config.create_if_missing ? 'true' : 'false';

			next_expression =
				'jsonb_set_lax(' + next_expression + ", '" + path_literal + "', " + value_placeholder + '::jsonb, ' +
				create_if_missing_sql + ", '" + set_lax_config.null_value_treatment + "')";
			set_lax_index += 1;
		}

		return next_expression;
	}

	function build_update_path_literal(path_value) {
		return build_path_literal(split_update_path(path_value));
	}

	function collect_update_path_entries(update_operator_entries) {
		const update_path_entries = [];
		let operator_index = 0;

		while(operator_index < update_operator_entries.length) {
			const operator_entry = update_operator_entries[operator_index];
			const definition = operator_entry.definition;

			if(definition === undefined) {
				operator_index += 1;
				continue;
			}

			const path_entries = Object.entries(definition);
			let path_index = 0;

			while(path_index < path_entries.length) {
				const path_entry = path_entries[path_index];
				const path_value = path_entry[0];

				split_update_path(path_value, operator_entry.operator_name);
				update_path_entries.push({
					operator_name: operator_entry.operator_name,
					path: path_value
				});

				path_index += 1;
			}

			operator_index += 1;
		}

		return update_path_entries;
	}

	function assert_no_conflicting_update_paths(update_path_entries) {
		let left_index = 0;

		while(left_index < update_path_entries.length) {
			let right_index = left_index + 1;

			while(right_index < update_path_entries.length) {
				const left_entry = update_path_entries[left_index];
				const right_entry = update_path_entries[right_index];

				if(do_update_paths_conflict(left_entry.path, right_entry.path)) {
					throw new QueryError('Conflicting update paths are not allowed in a single update_one call', {
						left: left_entry,
						right: right_entry
					});
				}

				right_index += 1;
			}

			left_index += 1;
		}
	}

	function do_update_paths_conflict(left_path, right_path) {
		if(left_path === right_path) {
			return true;
		}

		return left_path.indexOf(right_path + '.') === 0 || right_path.indexOf(left_path + '.') === 0;
	}

	function split_update_path(path_value, operator_name) {
		const path_segments = path_value.split('.');
		let segment_index = 0;

		while(segment_index < path_segments.length) {
			const segment_value = path_segments[segment_index];
			const is_root = segment_index === 0;

			if(segment_value.length === 0) {
				throw new QueryError('Update path contains an empty segment', {
					operator: operator_name,
					path: path_value
				});
			}

			if(is_root && !update_path_root_segment_pattern.test(segment_value)) {
				throw new QueryError('Update path root segment has invalid characters', {
					operator: operator_name,
					path: path_value
				});
			}

			if(!is_root && !update_path_nested_segment_pattern.test(segment_value)) {
				throw new QueryError('Update path contains an invalid nested segment', {
					operator: operator_name,
					path: path_value
				});
			}

			segment_index += 1;
		}

		return path_segments;
	}

	function cast_update_parameter_value(casted_value) {
		if(casted_value === null) {
			return null;
		}

		return jsonb_stringify(casted_value);
	}

	function normalize_insert_update(path_value, insert_definition_value) {
		if(is_not_object(insert_definition_value)) {
			return {
				value: insert_definition_value,
				insert_after: false
			};
		}

		assert_condition(has_own(insert_definition_value, 'value'), '$insert entry for path "' + path_value + '" must include value');

		if(insert_definition_value.insert_after !== undefined) {
			assert_condition(typeof insert_definition_value.insert_after === 'boolean', '$insert.insert_after for path "' + path_value + '" must be a boolean');
		}

		return {
			value: insert_definition_value.value,
			insert_after: insert_definition_value.insert_after === true
		};
	}

	function normalize_set_lax_update(path_value, set_lax_definition_value) {
		if(is_not_object(set_lax_definition_value)) {
			return {
				value: set_lax_definition_value,
				create_if_missing: true,
				null_value_treatment: 'use_json_null'
			};
		}

		assert_condition(has_own(set_lax_definition_value, 'value'), '$set_lax entry for path "' + path_value + '" must include value');

		if(set_lax_definition_value.create_if_missing !== undefined) {
			assert_condition(typeof set_lax_definition_value.create_if_missing === 'boolean', '$set_lax.create_if_missing for path "' + path_value + '" must be a boolean');
		}

		const null_value_treatment = set_lax_definition_value.null_value_treatment ?? 'use_json_null';
		assert_valid_set_lax_null_treatment(path_value, null_value_treatment);

		return {
			value: set_lax_definition_value.value,
			create_if_missing: set_lax_definition_value.create_if_missing !== false,
			null_value_treatment: null_value_treatment
		};
	}

	function assert_valid_set_lax_null_treatment(path_value, null_value_treatment) {
		const allowed_null_treatments = ['raise_exception', 'use_json_null', 'delete_key', 'return_target'];
		assert_condition(
			allowed_null_treatments.includes(null_value_treatment),
			'$set_lax.null_value_treatment for path "' + path_value + '" must be one of: ' + allowed_null_treatments.join(', ')
		);
	}

	function is_missing_relation_query_error(error) {
		if(!(error instanceof QueryError)) {
			return false;
		}

		const cause_message = error.details && error.details.cause;

		if(typeof cause_message !== 'string') {
			return false;
		}

		return cause_message.indexOf('relation ') !== -1 && cause_message.indexOf('does not exist') !== -1;
	}

	function assert_model_id_strategy_supported(final_id_strategy) {
		if(final_id_strategy !== IdStrategies.uuidv7) {
			return;
		}

		if(!has_pool()) {
			return;
		}

		const server_capabilities = get_server_capabilities();
		assert_id_strategy_capability(final_id_strategy, server_capabilities);
	}

	async function ensure_schema_indexes(final_table_name) {
		const schema_indexes = resolve_schema_indexes(schema_instance);
		let index_position = 0;

		while(index_position < schema_indexes.length) {
			const index_definition = schema_indexes[index_position];

			await ensure_index(
				final_table_name,
				index_definition.index_spec,
				model_options.data_column,
				index_definition.index_options
			);

			index_position += 1;
		}
	}

	if(has_pool()) {
		const connection_options = get_connection_options();
		const eager_id_strategy = model_options.id_strategy ?? connection_options.id_strategy;

		if(eager_id_strategy === IdStrategies.uuidv7) {
			Model.assert_id_strategy_supported();
		}
	}

	return Model;
}




