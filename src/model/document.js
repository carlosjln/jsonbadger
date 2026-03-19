import DirtyTracker from '#src/model/dirty-tracker.js';

import {has_own} from '#src/utils/object.js';
import {split_dot_path} from '#src/utils/object-path.js';
import {is_not_object} from '#src/utils/value.js';

/**
 * Create one document instance from normalized state.
 *
 * @param {object} [data]
 * @param {object} [options]
 * @param {object} [options.watch]
 * @param {function} [options.intercept_set]
 * @returns {Document}
 */
function Document(data = {}, options = {}) {
	Object.assign(this, data);

	// Merge prototype-level watches (this.watch) with instance-level overrides (options.watch)
	let merged_watch = null;
	if(this.watch || options.watch) {
		merged_watch = Object.assign({}, this.watch, options.watch);
	}

	return this.track_changes({
		watch: merged_watch,
		intercept_set: options.intercept_set
	});
}

Object.setPrototypeOf(Document.prototype, DirtyTracker.prototype);

/**
 * Apply one state object onto this document.
 *
 * @param {object} [data]
 * @returns {Document}
 */
Document.prototype.init = function (data = {}) {
	Object.assign(this, data);

	return this;
};

/**
 * Read one document value by path.
 *
 * @param {string} path_name
 * @returns {*}
 */
Document.prototype.get = function (path_name) {
	const path_segments = split_dot_path(path_name);
	let current_value = this;

	for(const segment of path_segments) {
		if(is_not_object(current_value) || !has_own(current_value, segment)) {
			return undefined;
		}

		current_value = current_value[segment];
	}

	return current_value;
};

/**
 * Set one document value by path.
 * The proxy wrapper will automatically track these mutations.
 *
 * @param {string} path
 * @param {*} value
 * @returns {Document}
 */
Document.prototype.set = function (path, value) {
	const path_segments = split_dot_path(path);
	const depth = path_segments.length - 1;
	let current_value = this;

	// Traverse and create intermediate objects if they don't exist
	for(let i = 0; i < depth; i++) {
		const segment = path_segments[i];

		if(is_not_object(current_value[segment])) {
			current_value[segment] = {};
		}

		current_value = current_value[segment];
	}

	// Because `this` is a Proxy, this native assignment automatically 
	// triggers the DirtyTracker's `set` trap, updating `dirty_keys` 
	// with the full dot notation path and evaluating watchers.
	const leaf_segment = path_segments[depth];
	current_value[leaf_segment] = value;

	return this;
};

export default Document;
