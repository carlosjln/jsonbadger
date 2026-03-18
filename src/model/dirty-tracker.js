import {deep_clone, is_function, is_not_object, is_object} from '#src/utils/value.js';

// Isolated Symbol Store to prevent collision with inheriting classes
const dt_store = Symbol('dirty_tracker_store');

/*
 * PROTOTYPE DEFINITION
 */

function DirtyTracker() {}

DirtyTracker.prototype.track_changes = function (config = {}) {
	const target = this;

	// Initialize the isolated store
	const store = {
		base_state: deep_clone(target),
		dirty_keys: new Set(),
		watchers: []
	};

	target[dt_store] = store;

	// Parse and bind Watchers
	if(is_object(config.watch)) {
		const watch_keys = Object.keys(config.watch);
		let key_index = 0;

		while(key_index < watch_keys.length) {
			const watch_path = watch_keys[key_index];
			const watch_config = config.watch[watch_path];

			const watcher = {
				path: watch_path,
				handler: is_function(watch_config) ? watch_config : watch_config.handler,
				deep: watch_config.deep === true,
				once: watch_config.once === true,
				active: true
			};

			store.watchers.push(watcher);

			// Handle immediate execution
			if(watch_config.immediate) {
				const initial_value = read_path(target, watch_path);
				watcher.handler.call(target, initial_value, undefined);

				if(watcher.once) {
					watcher.active = false;
				}
			}

			key_index += 1;
		}
	}

	// Must return the proxy to wrap the instance
	return build_proxy(target, '', target);
};

DirtyTracker.prototype.has_dirty_fields = function () {
	const store = this[dt_store];
	if(store) {
		return store.dirty_keys.size > 0;
	}

	return false;
};

DirtyTracker.prototype.get_dirty_fields = function () {
	const store = this[dt_store];
	if(store) {
		return Array.from(store.dirty_keys);
	}

	return [];
};

DirtyTracker.prototype.reset_dirty_fields = function () {
	const store = this[dt_store];
	if(!store) {
		return;
	}

	const original = store.base_state;
	const original_keys = Object.keys(original);
	let key_index = 0;

	// Because we execute this ON the proxied instance, resetting the values 
	// here will automatically trigger the setters, naturally reverting the 
	// dirty_keys set and cleanly firing any relevant watchers.
	while(key_index < original_keys.length) {
		const key = original_keys[key_index];

		if(!is_function(original[key])) {
			this[key] = deep_clone(original[key]);
		}

		key_index += 1;
	}

	store.dirty_keys.clear();
};

DirtyTracker.prototype.rebase_dirty_fields = function () {
	const store = this[dt_store];

	if(!store) {
		return;
	}

	store.base_state = deep_clone(this);
	store.dirty_keys.clear();
};

DirtyTracker.prototype.watch = function (watch_path, watch_config) {
	const store = this[dt_store];

	if(!store) {
		throw new Error('Cannot add watcher: track_changes() must be called first.');
	}

	const watcher = {
		path: watch_path,
		handler: is_function(watch_config) ? watch_config : watch_config.handler,
		deep: is_object(watch_config) && watch_config.deep === true,
		once: is_object(watch_config) && watch_config.once === true,
		active: true
	};

	store.watchers.push(watcher);

	if(is_object(watch_config) && watch_config.immediate) {
		const initial_value = read_path(this, watch_path);
		watcher.handler.call(this, initial_value, undefined);

		if(watcher.once) {
			watcher.active = false;
		}
	}

	// Return the closure to unwatch
	return () => {
		watcher.active = false;
		const index = store.watchers.indexOf(watcher);

		if(index !== -1) {
			store.watchers.splice(index, 1);
		}
	};
};

/*
 * EXTERNAL FUNCTIONAL HELPERS
 */

function read_path(root_object, dot_path) {
	if(!dot_path) {
		return root_object;
	}

	const segments = dot_path.split('.');
	let current_value = root_object;
	let segment_index = 0;

	while(segment_index < segments.length) {
		if(is_not_object(current_value)) {
			return undefined;
		}
		current_value = current_value[segments[segment_index]];
		segment_index += 1;
	}

	return current_value;
}

/*
 * BATCHED WATCHER SCHEDULER
 */

const pending_watchers = new Map();
let is_flushing = false;

function check_watchers(store, mutated_path, old_value, root_target) {
	const watchers = store.watchers;
	let watcher_index = 0;

	while(watcher_index < watchers.length) {
		const watcher = watchers[watcher_index];
		if(!watcher.active) {
			watcher_index += 1;
			continue;
		}

		let should_trigger = false;
		let handler_new_value = undefined;
		let handler_old_value = old_value;

		// Exact path match
		if(watcher.path === mutated_path) {
			should_trigger = true;
			handler_new_value = read_path(root_target, mutated_path);
		}
		// Deep mutation (e.g., watching 'user', mutated 'user.name')
		else if(watcher.deep && mutated_path.startsWith(watcher.path + '.')) {
			should_trigger = true;
			// In deep mutations, new and old values are identical references to the same parent object
			handler_new_value = read_path(root_target, watcher.path);
			handler_old_value = handler_new_value;
		}
		// Parent replacement (e.g., watching 'user.name', mutated 'user')
		else if(watcher.path.startsWith(mutated_path + '.')) {
			should_trigger = true;
			handler_new_value = read_path(root_target, watcher.path);

			// Attempt to extract the old nested value from the replaced parent object
			const nested_path = watcher.path.substring(mutated_path.length + 1);
			handler_old_value = read_path(old_value, nested_path);
		}

		if(should_trigger) {
			queue_watcher(watcher, handler_new_value, handler_old_value, root_target);
		}

		watcher_index += 1;
	}
}

function queue_watcher(watcher, new_value, old_value, context) {
	// Deduplicate watchers in the same tick.
	// If it exists, we update to the latest new_value, but keep the initial old_value of this tick.
	if(pending_watchers.has(watcher)) {
		pending_watchers.get(watcher).new_value = new_value;
	} else {
		pending_watchers.set(watcher, {new_value, old_value, context});
	}

	if(is_flushing) {
		return;
	}

	is_flushing = true;

	// Flush asynchronously on the next microtask (after synchronous code finishes)
	Promise.resolve().then(() => {
		const jobs = Array.from(pending_watchers.entries());
		pending_watchers.clear();
		is_flushing = false;

		let job_index = 0;
		while(job_index < jobs.length) {
			const job_watcher = jobs[job_index][0];
			const job_args = jobs[job_index][1];

			if(job_watcher.active) {
				job_watcher.handler.call(
					job_args.context,
					job_args.new_value,
					job_args.old_value
				);

				if(job_watcher.once) {
					job_watcher.active = false; // Mark inactive after first run
				}
			}
			job_index += 1;
		}
	});
}

/*
 * LAZY PROXY BUILDER
 */

function build_proxy(target_object, base_path, root_target) {
	return new Proxy(target_object, {
		get(target, prop) {
			// Do not proxy internal JS symbols
			if(typeof prop === 'symbol') {
				return target[prop];
			}

			// Root level: allow access to class methods on the prototype
			if(base_path === '') {
				if(prop in target && is_function(target[prop])) {
					return target[prop];
				}
			}

			const value = target[prop];

			// Lazy-proxy nested objects on access
			if(is_object(value)) {
				const next_path = base_path === '' ? prop : `${base_path}.${prop}`;
				return build_proxy(value, next_path, root_target);
			}

			return value;
		},

		set(target, prop, value) {
			if(typeof prop === 'symbol') {
				target[prop] = value;
				return true;
			}

			// Do not track mutations to functions/methods
			if(base_path === '' && is_function(target[prop])) {
				target[prop] = value;
				return true;
			}

			const full_path = base_path === '' ? prop : `${base_path}.${prop}`;
			const store = root_target[dt_store];

			const old_value = target[prop];
			const original_value = read_path(store.base_state, full_path);

			// Apply the mutation
			target[prop] = value;

			// Track Dirty State
			if(original_value !== value) {
				store.dirty_keys.add(full_path);
			} else {
				store.dirty_keys.delete(full_path);
			}

			// Trigger Watchers
			if(old_value !== value) {
				check_watchers(store, full_path, old_value, root_target);
			}

			return true;
		}
	});
}

export default DirtyTracker;
