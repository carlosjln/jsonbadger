import {
	update_operator_names,
	update_operator_order
} from '#src/model/factory/constants.js';

import {
	apply_insert_updates,
	apply_set_lax_updates,
	apply_set_updates,
	assert_update_operator_definition_type,
	split_set_updates
} from '#src/model/factory/update-helpers.js';

// Pull the `$set` payload from the full update object.
function get_set_definition(update_definition) {
	return update_definition[update_operator_names.set];
}

// Validate that `$set` is present as an object payload.
function assert_set_definition(definition, allowed_operators) {
	assert_update_operator_definition_type(update_operator_names.set, definition, allowed_operators);
}

// Collect `$set` paths so the shared conflict checker can inspect them.
function collect_set_paths(definition) {
	if(definition === undefined) {
		return [];
	}

	return Object.keys(definition);
}

// Apply `$set` to the JSONB expression and surface timestamp writes separately.
function apply_set_definition(apply_context) {
	const split_definition = split_set_updates(apply_context.definition);
	const next_data_expression = apply_set_updates(
		apply_context.data_expression,
		split_definition.data_set,
		apply_context.parameter_state,
		apply_context.schema_instance
	);

	return {
		data_expression: next_data_expression,
		timestamp_set: split_definition.timestamp_set
	};
}

// Pull the `$insert` payload from the full update object.
function get_insert_definition(update_definition) {
	return update_definition[update_operator_names.insert];
}

// Validate that `$insert` is present as an object payload.
function assert_insert_definition(definition, allowed_operators) {
	assert_update_operator_definition_type(update_operator_names.insert, definition, allowed_operators);
}

// Collect `$insert` paths so the shared conflict checker can inspect them.
function collect_insert_paths(definition) {
	if(definition === undefined) {
		return [];
	}

	return Object.keys(definition);
}

// Apply `$insert` updates to the current JSONB expression.
function apply_insert_definition(apply_context) {
	const next_data_expression = apply_insert_updates(
		apply_context.data_expression,
		apply_context.definition,
		apply_context.parameter_state,
		apply_context.schema_instance
	);

	return {
		data_expression: next_data_expression
	};
}

// Pull the `$set_lax` payload from the full update object.
function get_set_lax_definition(update_definition) {
	return update_definition[update_operator_names.set_lax];
}

// Validate that `$set_lax` is present as an object payload.
function assert_set_lax_definition(definition, allowed_operators) {
	assert_update_operator_definition_type(update_operator_names.set_lax, definition, allowed_operators);
}

// Collect `$set_lax` paths so the shared conflict checker can inspect them.
function collect_set_lax_paths(definition) {
	if(definition === undefined) {
		return [];
	}

	return Object.keys(definition);
}

// Apply `$set_lax` updates to the current JSONB expression.
function apply_set_lax_definition(apply_context) {
	const next_data_expression = apply_set_lax_updates(
		apply_context.data_expression,
		apply_context.definition,
		apply_context.parameter_state,
		apply_context.schema_instance
	);

	return {
		data_expression: next_data_expression
	};
}

const update_operator_registry = Object.freeze({
	[update_operator_names.set]: Object.freeze({
		get_definition: get_set_definition,
		assert_definition: assert_set_definition,
		collect_paths: collect_set_paths,
		apply: apply_set_definition
	}),
	[update_operator_names.insert]: Object.freeze({
		get_definition: get_insert_definition,
		assert_definition: assert_insert_definition,
		collect_paths: collect_insert_paths,
		apply: apply_insert_definition
	}),
	[update_operator_names.set_lax]: Object.freeze({
		get_definition: get_set_lax_definition,
		assert_definition: assert_set_lax_definition,
		collect_paths: collect_set_lax_paths,
		apply: apply_set_lax_definition
	})
});

// Resolve only the supported operator entries, in the order the compiler applies them.
function resolve_update_operator_entries(update_definition) {
	const update_object = update_definition || {};
	const update_operator_entries = [];

	for(const operator_name of update_operator_order) {
		const operator_descriptor = update_operator_registry[operator_name];
		const definition = operator_descriptor.get_definition(update_object);

		if(definition === undefined) {
			continue;
		}

		update_operator_entries.push({
			operator_name: operator_name,
			definition: definition,
			operator_descriptor: operator_descriptor
		});
	}

	return update_operator_entries;
}

export {
	resolve_update_operator_entries,
	update_operator_registry
};
