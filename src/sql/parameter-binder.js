function create_parameter_state(start_index) {
	return {
		params: [],
		current_index: start_index || 1
	};
}

function bind_parameter(parameter_state, value) {
	const placeholder = '$' + parameter_state.current_index;
	parameter_state.params.push(value);
	parameter_state.current_index += 1;
	return placeholder;
}

export {
	create_parameter_state,
	bind_parameter
};
