import {deep_clone, is_function, is_not_object, is_object} from '#src/utils/value.js';

// dirty-tracker: static

/*
 * MAIN API
 */

/**
 * Wrap this object with dirty tracking and optional set interception.
 *
 * @param {object} target
 * @param {object} [options]
 * @param {object} [options.watch]
 * @param {function} [options.intercept_set]
 * @returns {Proxy}
 */
function track_changes(target, options = {}) {
	const store = {
		root_object: target,
		base_state: deep_clone(target),
		dirty_keys: new Set(),
		watchers: []
	};

	let root_proxy;
	const get_root = () => root_proxy;

	// Build the intercepting proxy
	root_proxy = build_proxy(target, target, store, get_root, options);

	// Parse and bind Watchers
	if(is_object(options.watch)) {
		const watch_keys = Object.keys(options.watch);
		let key_index = 0;

		while(key_index < watch_keys.length) {
			const watch_path = watch_keys[key_index];
			add_watcher(root_proxy, watch_path, options.watch[watch_path]);
			key_index += 1;
		}
	}

	// Register the root proxy for static utility lookups
	tracker_registry.set(root_proxy, store);

	return root_proxy;
}

/*
 * LAZY PROXY BUILDER
 */

function build_proxy(target_object, root_object, store, get_root, options = {}) {
	const base_path = options.base_path || '';
	let intercept_set = (path, next_value) => next_value;

	if(is_function(options.intercept_set)) {
		intercept_set = options.intercept_set;
	}

	return new Proxy(target_object, {
		get(target, prop) {
			// Do not proxy internal JS symbols
			if(typeof prop === 'symbol') {
				return target[prop];
			}

			// Root level: allow access to tracker methods
			if(base_path === '') {
				if(prop in target && is_function(target[prop])) {
					return target[prop];
				}
			}

			const value = target[prop];

			// Lazy-proxy nested objects on access
			if(is_object(value)) {
				const next_path = base_path === '' ? prop : `${base_path}.${prop}`;
				const next_options = {...options, base_path: next_path};
				return build_proxy(value, root_object, store, get_root, next_options);
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
			const next_value = intercept_set(full_path, value);

			const old_value = target[prop];
			const original_value = read_path(store.base_state, full_path);

			// Apply the mutation
			target[prop] = next_value;

			// Track Dirty State
			if(original_value !== next_value) {
				store.dirty_keys.add(full_path);
			} else {
				store.dirty_keys.delete(full_path);
			}

			// Trigger Watchers
			if(old_value !== next_value) {
				check_watchers(store, full_path, old_value, root_object, get_root());
			}

			return true;
		}
	});
}

/*
 * STATE MANAGEMENT HELPERS
 */

const tracker_registry = new WeakMap();

function has_dirty_fields(proxy) {
	const store = tracker_registry.get(proxy);
	return store ? store.dirty_keys.size > 0 : false;
}

function get_dirty_fields(proxy) {
	const store = tracker_registry.get(proxy);
	return store ? Array.from(store.dirty_keys) : [];
}

function reset_dirty_fields(proxy) {
	const store = tracker_registry.get(proxy);

	if(!store) {
		return;
	}

	const original = store.base_state;
	const original_keys = Object.keys(original);
	let key_index = 0;

	// Resetting through the proxy triggers setters naturally
	while(key_index < original_keys.length) {
		const key = original_keys[key_index];

		if(!is_function(original[key])) {
			proxy[key] = deep_clone(original[key]);
		}

		key_index += 1;
	}

	store.dirty_keys.clear();
}

function rebase_dirty_fields(proxy) {
	const store = tracker_registry.get(proxy);

	if(!store) {
		return;
	}

	store.base_state = deep_clone(store.root_object);
	store.dirty_keys.clear();
}

/*
 * WATCHER HELPERS
 */

function add_watcher(proxy, path, options) {
	const store = tracker_registry.get(proxy);

	if(!store) {
		throw new Error('Cannot add watcher: Object is not actively tracked.');
	}

	const handler = is_function(options) ? options : () => {};
	const config = is_object(options) ? options : {handler};

	const watcher = {
		path,
		handler: config.handler,
		deep: config.deep === true,
		once: config.once === true,
		active: true
	};

	store.watchers.push(watcher);

	if(config.immediate) {
		const initial_value = read_path(store.root_object, path);
		watcher.handler.call(proxy, initial_value, undefined);

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
}

const pending_watchers = new Map();
let is_flushing = false;

function check_watchers(store, mutated_path, old_value, root_object, root_proxy) {
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
			handler_new_value = read_path(root_object, mutated_path);
		}
		// Deep mutation (e.g., watching 'user', mutated 'user.name')
		else if(watcher.deep && mutated_path.startsWith(watcher.path + '.')) {
			should_trigger = true;
			// In deep mutations, new and old values are identical references to the same parent object
			handler_new_value = read_path(root_object, watcher.path);
			handler_old_value = handler_new_value;
		}
		// Parent replacement (e.g., watching 'user.name', mutated 'user')
		else if(watcher.path.startsWith(mutated_path + '.')) {
			should_trigger = true;
			handler_new_value = read_path(root_object, watcher.path);

			// Attempt to extract the old nested value from the replaced parent object
			const nested_path = watcher.path.substring(mutated_path.length + 1);
			handler_old_value = read_path(old_value, nested_path);
		}

		if(should_trigger) {
			queue_watcher(watcher, handler_new_value, handler_old_value, root_proxy);
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
 * PATH HELPERS
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

export {
	track_changes,
	has_dirty_fields,
	get_dirty_fields,
	reset_dirty_fields,
	rebase_dirty_fields,
	add_watcher
};
