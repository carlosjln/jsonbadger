import ensure_index from '#src/migration/ensure-index.js';
import ensure_schema from '#src/migration/ensure-schema.js';
import resolve_schema_indexes from '#src/migration/schema-indexes-resolver.js';
import ensure_table from '#src/migration/ensure-table.js';

import {ensure_model_runtime_state} from '#src/model/factory/model-runtime-state.js';

/**
 * Installs migration and schema helpers on a model constructor.
 *
 * @param {Function} Model Model constructor.
 * @param {object} schema_instance Schema instance.
 * @param {object} model_options Model options.
 * @returns {void}
 */
function install_migration_methods(Model, schema_instance, model_options) {
	Model.ensure_table = async function () {
		const final_table_name = model_options.table_name;
		const final_id_strategy = Model.assert_id_strategy_supported();

		await ensure_table(final_table_name, model_options.data_column, final_id_strategy, Model.connection);

		if(are_model_indexes_ensured(Model) || !Model.resolve_auto_index()) {
			return;
		}

		await ensure_schema_indexes(Model, schema_instance, model_options);
		mark_model_indexes_ensured(Model);
	};

	Model.ensure_index = async function () {
		const final_table_name = model_options.table_name;
		const final_id_strategy = Model.assert_id_strategy_supported();

		await ensure_table(final_table_name, model_options.data_column, final_id_strategy, Model.connection);
		await ensure_schema_indexes(Model, schema_instance, model_options);

		mark_model_indexes_ensured(Model);
	};

	Model.ensure_schema = async function () {
		const final_id_strategy = Model.assert_id_strategy_supported();
		await ensure_schema(model_options.table_name, model_options.data_column, schema_instance, final_id_strategy, Model.connection);
		mark_model_indexes_ensured(Model);
	};
}

// Check whether schema indexes were already ensured for this model constructor.
function are_model_indexes_ensured(Model) {
	const model_runtime_state = ensure_model_runtime_state(Model);
	return model_runtime_state.indexes_ensured === true;
}

// Mark schema indexes as ensured for this model constructor.
function mark_model_indexes_ensured(Model) {
	const model_runtime_state = ensure_model_runtime_state(Model);
	model_runtime_state.indexes_ensured = true;
}

// Ensure all schema-defined indexes exist for this model constructor.
async function ensure_schema_indexes(model_constructor, next_schema_instance, next_model_options) {
	const schema_indexes = resolve_schema_indexes(next_schema_instance);

	for(const index_definition of schema_indexes) {
		await ensure_index(
			next_model_options.table_name,
			index_definition,
			next_model_options.data_column,
			model_constructor.connection
		);
	}
}

export {
	install_migration_methods
};
