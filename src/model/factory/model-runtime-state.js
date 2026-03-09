import {is_plain_object} from '#src/utils/value.js';

// Ensure the model constructor owns an explicit runtime-state object.
function ensure_model_runtime_state(Model) {
	if(!is_plain_object(Model.model_runtime_state)) {
		Model.model_runtime_state = {
			indexes_ensured: false
		};
	}

	if(typeof Model.model_runtime_state.indexes_ensured !== 'boolean') {
		Model.model_runtime_state.indexes_ensured = false;
	}

	return Model.model_runtime_state;
}

// Clear the schema-index ensured flag for this model constructor.
function reset_model_index_cache(Model) {
	const model_runtime_state = ensure_model_runtime_state(Model);
	model_runtime_state.indexes_ensured = false;
}

export {
	ensure_model_runtime_state,
	reset_model_index_cache
};
