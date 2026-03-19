import {to_array} from '#src/utils/array.js';
import {deep_clone, is_function, is_not_object, is_object} from '#src/utils/value.js';

// DELTA-TRACKER v1

/**
 * Create a new state store instance that proxies a root object,
 * optionally restricting tracking to specific child branches.
 * Emits a structured NoSQL-style delta object natively.
 *
 * @param {object} target
 * @param {object} [options]
 * @param {string[]} [options.track] - Array of top-level keys to track (e.g., ['data', 'fields'])
 * @param {object} [options.watch]
 * @param {function} [options.intercept_set]
 * @returns {Proxy}
 */
function DeltaTracker(target, options = {}) {
	const track_list = get_track_list(options);
	const base_state = clone_tracked_state(target, track_list);

	const store = {
		base_state,
		// State-collapsed delta tracking
		delta_set: new Map(),        // path -> next_value
		delta_unset: new Set(),      // paths that were deleted
		replace_roots: new Map(),    // root_key -> full_object (when tracked roots are replaced entirely)
		watchers: [],
		// Reuse nested proxies so repeated reads preserve referential equality.
		proxy_cache: new WeakMap()
	};

	let root_proxy;
	const get_root = () => root_proxy;

	// Build the intercepting proxy
	root_proxy = build_proxy(target, target, store, get_root, options);
	// Seed the cache with the root object so nested traversals can share proxy identity.
	store.proxy_cache.set(target, root_proxy);

	// Parse and bind Watchers
	if(is_object(options.watch)) {
		const watch_keys = Object.keys(options.watch);
		let key_index = 0;

		while(key_index < watch_keys.length) {
			const watch_path = watch_keys[key_index];
			add_watcher(store, target, root_proxy, watch_path, options.watch[watch_path]);
			key_index += 1;
		}
	}

	return root_proxy;
}

/*
 * LAZY PROXY BUILDER
 */

/**
 * Build one lazy proxy for the provided object branch.
 *
 * @param {object} target_object
 * @param {object} root_object
 * @param {object} store
 * @param {function(): Proxy} get_root
 * @param {object} [options]
 * @returns {Proxy}
 */
function build_proxy(target_object, root_object, store, get_root, options = {}) {
	const track_list = get_track_list(options);
	const base_path = options.base_path || '';
	let intercept_set = (path, next_value) => next_value;

	if(is_function(options.intercept_set)) {
		intercept_set = options.intercept_set;
	}

	const internal_methods = Object.assign(Object.create(null), {
		$has_changes: () => {
			return has_changes(store);
		},
		$get_delta: () => {
			return get_delta(store);
		},
		$reset_changes: () => {
			return reset_changes(store, get_root());
		},
		$rebase_changes: () => {
			return rebase_changes(store, root_object, options);
		},
		$watch: (path, watch_options) => {
			return add_watcher(store, root_object, get_root(), path, watch_options);
		}
	});

	return new Proxy(target_object, {
		get(target, prop) {
			// Do not proxy internal JS symbols
			if(typeof prop === 'symbol') {
				return target[prop];
			}

			// Root level: allow access to tracker methods and pass through untracked branches
			if(base_path === '') {
				// Keep helper methods only at the root so tracked branches stay free of tracker
				// method names and can be treated as normal application data.
				const internal_method = internal_methods[prop];

				if(internal_method) {
					return internal_method;
				}

				if(prop in target && is_function(target[prop])) {
					return target[prop];
				}

				// Keep untracked root branches raw so only the declared tracked surface participates
				// in delta bookkeeping and helper-method interception.
				if(track_list && !track_list.includes(prop)) {
					return target[prop];
				}
			}

			const value = target[prop];

			// Lazy-proxy nested objects on access
			if(is_object(value)) {
				const cached_proxy = store.proxy_cache.get(value);

				if(cached_proxy) {
					// Reuse the same proxy instance so `tracker.user === tracker.user` stays true.
					return cached_proxy;
				}

				const next_path = base_path === '' ? prop : `${base_path}.${prop}`;
				const next_options = {...options, base_path: next_path};
				const nested_proxy = build_proxy(value, root_object, store, get_root, next_options);

				store.proxy_cache.set(value, nested_proxy);

				return nested_proxy;
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

			// Bypass tracking for untracked top-level keys
			if(base_path === '' && track_list && !track_list.includes(prop)) {
				target[prop] = value;
				return true;
			}

			const full_path = base_path === '' ? prop : `${base_path}.${prop}`;
			const next_value = intercept_set(full_path, value);
			const old_value = target[prop];

			// Delta state is snapshot-based where possible to naturally eliminate redundant writes
			const original_value = read_path(store.base_state, full_path);

			// Apply the mutation
			target[prop] = next_value;

			// Is this an assignment replacing a tracked root completely? (e.g. `document.data = {...}`)
			if(base_path === '' && track_list && track_list.includes(prop)) {
				store.replace_roots.set(prop, next_value);
				clear_nested_deltas(store, full_path);

			} else {
				// Standard nested operation tracking
				if(original_value === next_value) {
					// Reverted to baseline - remove from delta sets entirely
					store.delta_set.delete(full_path);
					store.delta_unset.delete(full_path);
				} else {
					// Cross-cancellation: setting a key overrides any unsets for it
					store.delta_set.set(full_path, next_value);
					store.delta_unset.delete(full_path);
					clear_nested_deltas(store, full_path); // Overwriting parent nullifies child ops
				}
			}

			// Trigger Watchers
			if(old_value !== next_value) {
				check_watchers(store, full_path, old_value, root_object, get_root());
			}

			return true;
		},

		deleteProperty(target, prop) {
			if(typeof prop === 'symbol') {
				return Reflect.deleteProperty(target, prop);
			}

			// Bypass tracking for untracked top-level keys
			if(base_path === '' && track_list && !track_list.includes(prop)) {
				return Reflect.deleteProperty(target, prop);
			}

			const full_path = base_path === '' ? prop : `${base_path}.${prop}`;
			const old_value = target[prop];

			// Apply the mutation
			const deleted = Reflect.deleteProperty(target, prop);

			if(deleted) {
				// Are we deleting a full tracked root? (e.g. `delete document.data`)
				if(base_path === '' && track_list && track_list.includes(prop)) {
					store.replace_roots.delete(prop);
					store.delta_unset.add(full_path);
					clear_nested_deltas(store, full_path);

				} else {
					// Cross-cancellation: deleting a key nullifies any pending sets for it
					store.delta_unset.add(full_path);
					store.delta_set.delete(full_path);
					clear_nested_deltas(store, full_path);
				}

				// Trigger Watchers (old_value will be the removed object, new value will be undefined)
				check_watchers(store, full_path, old_value, root_object, get_root());
			}

			return deleted;
		}
	});
}

/*
 * STATE MANAGEMENT HELPERS
 */

/**
 * Wipes out any pending set/unset instructions for children of a path.
 * Used when a parent object is overwritten or deleted natively collapsing state.
 *
 * @param {object} store
 * @param {string} parent_path
 * @returns {void}
 */
function clear_nested_deltas(store, parent_path) {
	const prefix = `${parent_path}.`;

	for(const key of store.delta_set.keys()) {
		if(key.startsWith(prefix)) {
			store.delta_set.delete(key);
		}
	}

	for(const key of store.delta_unset) {
		if(key.startsWith(prefix)) {
			store.delta_unset.delete(key);
		}
	}
}

/**
 * Normalize tracker options into a stable tracked-root list.
 *
 * @param {object} options
 * @param {string|string[]} [options.track]
 * @returns {string[]|null}
 */
function get_track_list(options) {
	return options.track === undefined ? null : to_array(options.track);
}

/**
 * Clone either the full source object or only the tracked root keys.
 *
 * @param {object} source_object
 * @param {string[]|null} track_list
 * @returns {object}
 */
function clone_tracked_state(source_object, track_list) {
	if(!track_list) {
		// Full tracking can reuse the deep clone directly instead of copying into another object.
		return deep_clone(source_object);
	}

	const cloned_state = {};
	let key_index = 0;

	while(key_index < track_list.length) {
		const key = track_list[key_index];

		if(key in source_object) {
			cloned_state[key] = deep_clone(source_object[key]);
		}

		key_index += 1;
	}

	return cloned_state;
}

/**
 * Check whether the tracker currently holds any pending changes.
 *
 * @param {object} store
 * @returns {boolean}
 */
function has_changes(store) {
	if(!store) {
		return false;
	}

	return store.delta_set.size > 0 || store.delta_unset.size > 0 || store.replace_roots.size > 0;
}

/**
 * Return the current delta snapshot for the tracked roots.
 *
 * @param {object} store
 * @returns {{replace_roots: object, set: object, unset: string[]}}
 */
function get_delta(store) {
	if(!store) {
		return {replace_roots: {}, set: {}, unset: []};
	}

	return {
		replace_roots: Object.fromEntries(store.replace_roots),
		set: Object.fromEntries(store.delta_set),
		unset: Array.from(store.delta_unset)
	};
}

/**
 * Reset tracked roots back to the current rebased snapshot.
 *
 * @param {object} store
 * @param {Proxy} proxy
 * @returns {void}
 */
function reset_changes(store, proxy) {
	const original = store.base_state;
	const original_keys = Object.keys(original);
	let key_index = 0;

	// Resetting through the proxy triggers setters naturally, effectively
	// reverting state and wiping out pending deltas through the snapshot diff.
	while(key_index < original_keys.length) {
		const key = original_keys[key_index];

		if(!is_function(original[key])) {
			proxy[key] = deep_clone(original[key]);
		}

		key_index += 1;
	}

	// Remove any fully replaced roots that didn't exist in the baseline
	for(const key of store.replace_roots.keys()) {
		if(!(key in original)) {
			delete proxy[key];
		}
	}

	store.delta_set.clear();
	store.delta_unset.clear();
	store.replace_roots.clear();
}

/**
 * Rebase the tracker snapshot against the current root object state.
 *
 * @param {object} store
 * @param {object} root_object
 * @param {object} options
 * @returns {void}
 */
function rebase_changes(store, root_object, options) {
	const track_list = get_track_list(options);
	store.base_state = clone_tracked_state(root_object, track_list);

	store.delta_set.clear();
	store.delta_unset.clear();
	store.replace_roots.clear();
}

/*
 * WATCHER HELPERS
 */

/**
 * Register one watcher against the tracked root proxy.
 *
 * @param {object} store
 * @param {object} root_object
 * @param {Proxy} proxy
 * @param {string} path
 * @param {object|function} options
 * @returns {function}
 */
function add_watcher(store, root_object, proxy, path, options) {
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
		const initial_value = read_path(root_object, path);
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

/**
 * Evaluate which watchers should react to one mutated path.
 *
 * @param {object} store
 * @param {string} mutated_path
 * @param {*} old_value
 * @param {object} root_object
 * @param {Proxy} root_proxy
 * @returns {void}
 */
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
			// Deep child writes mutate the same parent object in place, so there is no separate
			// pre-mutation parent snapshot to pass through here.
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

/**
 * Queue one watcher callback into the current microtask batch.
 *
 * @param {object} watcher
 * @param {*} new_value
 * @param {*} old_value
 * @param {*} context
 * @returns {void}
 */
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

	// Batch watcher delivery into one microtask so multiple synchronous writes collapse into a
	// single callback pass with the latest value and the first old value from that tick.
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

/**
 * Read one nested value by dot-notation path.
 *
 * @param {object} root_object
 * @param {string} dot_path
 * @returns {*}
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

export default DeltaTracker;
