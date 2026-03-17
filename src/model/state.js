const runtime_store = new WeakMap();

/**
 * Create and store one compiled-model runtime object by model constructor.
 *
 * @param {Function} key
 * @param {object} init_data
 * @returns {object}
 */
function create_runtime_store(key, init_data) {
	const runtime_data = Object.assign({}, init_data);

	runtime_store.set(key, runtime_data);
	return runtime_data;
}

/**
 * Read one compiled-model runtime object by model constructor.
 *
 * @param {Function} key
 * @returns {object|null}
 */
function get_runtime_store(key) {
	if(runtime_store.has(key)) {
		return runtime_store.get(key);
	}

	return null;
}

export {
	create_runtime_store,
	get_runtime_store
};
