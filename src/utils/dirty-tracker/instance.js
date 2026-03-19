import {to_array} from '#src/utils/array.js';
import {deep_clone, is_function, is_not_object, is_object} from '#src/utils/value.js';

// dirty-tracker: instance

/*
 * MAIN API
 */

/**
 * Create a new state store instance that proxies a root object,
 * optionally restricting tracking to specific child branches.
 *
 * @param {object} target
 * @param {object} [options]
 * @param {string[]} [options.track] - Array of top-level keys to track (e.g., ['data', 'fields'])
 * @param {object} [options.watch]
 * @param {function} [options.intercept_set]
 * @returns {Proxy}
 */
function DirtyTracker(target, options = {}) {
	const track_list = get_track_list(options);
	const base_state = clone_tracked_state(target, track_list);

	const store = {
		base_state,
		dirty_keys: new Set(),
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

function build_proxy(target_object, root_object, store, get_root, options = {}) {
	const track_list = get_track_list(options);
	const base_path = options.base_path || '';
	let intercept_set = (path, next_value) => next_value;

	if(is_function(options.intercept_set)) {
		intercept_set = options.intercept_set;
	}

	const internal_methods = Object.assign(Object.create(null), {
		$has_dirty_fields: () => {
			return has_dirty_fields(store);
		},
		$get_dirty_fields: () => {
			return get_dirty_fields(store);
		},
		$reset_dirty_fields: () => {
			return reset_dirty_fields(store, get_root());
		},
		$rebase_dirty_fields: () => {
			return rebase_dirty_fields(store, root_object, options);
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
				// The instance variant keeps helper methods only at the root so tracked payload branches
				// remain pure data and cannot collide with `$has_dirty_fields`-style names.
				const internal_method = internal_methods[prop];

				if(internal_method) {
					return internal_method;
				}

				if(prop in target && is_function(target[prop])) {
					return target[prop];
				}

				// Keep untracked root branches raw so only the declared tracked surface participates
				// in dirty-state bookkeeping and helper-method interception.
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
			// Dirty state is snapshot-based: compare the current write against the rebased baseline
			// rather than trying to replay or diff the full mutation history.
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

/**
 * Normalize tracker options into a stable track list.
 * If 'track' is omitted, it stays null (tracks everything).
 * If 'track' is provided (string, array, or []), it converts to a clean array.
 */
function get_track_list(options) {
	return options.track === undefined ? null : to_array(options.track);
}

/**
 * Clone either the full source object or only the tracked root keys.
 */
function clone_tracked_state(source_object, track_list) {
	if(!track_list) {
		// Full tracking can reuse the deep clone directly instead of copying into another object.
		return deep_clone(source_object);
	}

	const cloned_state = {};

	let key_index = 0;

	// This loop is on the tracked-state setup path, so `while` is kept deliberately for the
	// lowest-overhead iteration style in this file's hot paths.
	while(key_index < track_list.length) {
		const key = track_list[key_index];

		if(key in source_object) {
			cloned_state[key] = deep_clone(source_object[key]);
		}

		key_index += 1;
	}

	return cloned_state;
}

function has_dirty_fields(store) {
	return store ? store.dirty_keys.size > 0 : false;
}

function get_dirty_fields(store) {
	return store ? Array.from(store.dirty_keys) : [];
}

function reset_dirty_fields(store, proxy) {
	const original = store.base_state;
	const original_keys = Object.keys(original);
	let key_index = 0;

	// Resetting through the proxy triggers setters naturally.
	// Because `base_state` only holds tracked branches, untracked fields remain untouched.
	while(key_index < original_keys.length) {
		const key = original_keys[key_index];

		if(!is_function(original[key])) {
			proxy[key] = deep_clone(original[key]);
		}

		key_index += 1;
	}

	store.dirty_keys.clear();
}

function rebase_dirty_fields(store, root_object, options) {
	const track_list = get_track_list(options);
	store.base_state = clone_tracked_state(root_object, track_list);
	store.dirty_keys.clear();
}

/*
 * WATCHER HELPERS
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

export default DirtyTracker;
