import {is_not_object, is_object, is_plain_object} from '#src/utils/value.js';

function has_own(target, key) {
	return Object.prototype.hasOwnProperty.call(target, key);
}

/**
 * Performs a deep equality comparison between two values.
 * Handles primitives, objects, arrays, Dates, and circular references.
 *
 * @param {*} target_a
 * @param {*} target_b
 * @param {WeakMap<object, *>} memo
 * @returns {boolean}
 */
function are_equal(target_a, target_b, memo = new WeakMap()) {
	// 1. Check for strict identity or NaN equality
	if(Object.is(target_a, target_b)) {
		return true;
	}

	// 2. If either is not an object, they are not equal (identity check failed above)
	const is_array_a = Array.isArray(target_a);
	const is_array_b = Array.isArray(target_b);

	if(!is_array_a && (is_not_object(target_a) || is_not_object(target_b))) {
		return false;
	}

	// 3. Handle circular references and memoization
	const has_cached_reference = memo.has(target_a);
	if(has_cached_reference) {
		return memo.get(target_a) === target_b;
	}

	memo.set(target_a, target_b);

	// 4. Handle Date objects
	if(target_a instanceof Date || target_b instanceof Date) {
		if(!(target_a instanceof Date && target_b instanceof Date)) {
			return false;
		}
		return target_a.getTime() === target_b.getTime();
	}

	// 5. Handle Array comparison
	if(is_array_a !== is_array_b) {
		return false;
	}

	if(is_array_a) {

		// Check length first for performance
		if(target_a.length !== target_b.length) {
			return false;
		}

		// Recursively check elements
		for(let i = 0; i < target_a.length; i++) {
			const items_match = are_equal(target_a[i], target_b[i], memo);
			if(!items_match) {
				return false;
			}
		}
		return true;
	}

	// 6. Handle Plain Object comparison
	const keys_a = Object.keys(target_a);
	const keys_b = Object.keys(target_b);

	if(keys_a.length !== keys_b.length) {
		return false;
	}

	for(let i = 0; i < keys_a.length; i++) {
		const key = keys_a[i];

		// Ensure the property exists on the second object
		if(!has_own(target_b, key)) {
			return false;
		}

		// Recursively check values
		if(!are_equal(target_a[key], target_b[key], memo)) {
			return false;
		}
	}

	return true;
}

/**
 * Deep-clones plain data while preserving built-in value semantics.
 *
 * @param {*} value Source value to clone.
 * @param {WeakMap<object, *>} cache Circular-reference cache.
 * @returns {*}
 */
function deep_clone(value, cache = new WeakMap()) {
	if(value === null || typeof value !== 'object') {
		return value;
	}

	if(cache.has(value)) {
		return cache.get(value);
	}

	if(value instanceof Date) {
		return new Date(value.getTime());
	}

	if(value instanceof RegExp) {
		const cloned_regexp = new RegExp(value.source, value.flags);
		cloned_regexp.lastIndex = value.lastIndex;
		return cloned_regexp;
	}

	if(Buffer.isBuffer(value)) {
		return Buffer.from(value);
	}

	if(value instanceof Map) {
		const cloned_map = new Map();
		cache.set(value, cloned_map);

		for(const [map_key, map_value] of value.entries()) {
			cloned_map.set(deep_clone(map_key, cache), deep_clone(map_value, cache));
		}

		return cloned_map;
	}

	if(value instanceof Set) {
		const cloned_set = new Set();
		cache.set(value, cloned_set);

		for(const set_value of value.values()) {
			cloned_set.add(deep_clone(set_value, cache));
		}

		return cloned_set;
	}

	if(Array.isArray(value)) {
		const result = [];
		cache.set(value, result);

		for(let i = 0; i < value.length; i++) {
			result[i] = deep_clone(value[i], cache);
		}

		return result;
	}

	// Bugfix note:
	// Native structuredClone flattens custom class instances into plain objects, which corrupts
	// parser-produced FieldType instances stored inside options (`of_field_type`, union candidates).
	// Keep non-plain objects by reference here so runtime methods stay intact.
	if(!is_plain_object(value)) {
		return value;
	}

	const result = {};
	const keys = Object.keys(value);
	cache.set(value, result);

	for(let i = 0; i < keys.length; i++) {
		const key = keys[i];
		result[key] = deep_clone(value[key], cache);
	}

	return result;
}

function conform(schema, value, cache = new WeakMap()) {
	// 1. Array Handling
	if(Array.isArray(schema)) {
		const item_schema = schema.length ? schema[0] : undefined;
		if(item_schema === undefined) return []; // Empty schema enforces empty array

		const source_list = Array.isArray(value) ? value : [];

		if(cache.has(source_list)) return cache.get(source_list);

		const result_list = [];
		cache.set(source_list, result_list);

		for(let i = 0; i < source_list.length; i++) {
			const item = source_list[i];
			// If strict object matching is needed, skip invalid items
			if(is_object(item_schema) && !is_object(item)) continue;

			result_list.push(conform(item_schema, item, cache));
		}

		return result_list;
	}

	// 2. Object Handling
	if(is_object(schema)) {
		const source_obj = is_object(value) ? value : null;

		if(source_obj && cache.has(source_obj)) return cache.get(source_obj);

		const result_obj = {};
		if(source_obj) cache.set(source_obj, result_obj);

		// Iterate schema keys (sanitization: ignores extra keys in value)
		const keys = Object.keys(schema);
		for(let i = 0; i < keys.length; i++) {
			const key = keys[i];
			const sub_value = source_obj ? source_obj[key] : undefined;
			result_obj[key] = conform(schema[key], sub_value, cache);
		}

		return result_obj;
	}

	// 3. Primitives & Defaults
	if(value === undefined || value === null) {
		// Return cloned default to prevent shared reference issues
		return typeof schema === 'object' ? deep_clone(schema) : schema;
	}

	const type = typeof schema;

	if(type === 'string') {
		return String(value).trim();
	}

	if(type === 'number') {
		const num = Number(value);
		if(!Number.isFinite(num)) return schema; // Invalid number returns default

		// Apply specific integer/positive logic based on schema default
		const normalized = Number.isInteger(schema) ? Math.floor(num) : num;
		return normalized >= 0 ? normalized : schema;
	}

	if(type === 'boolean') {
		return Boolean(value);
	}

	return deep_clone(schema);
}

function merge(schema, base, value, cache = new WeakMap()) {
	if(value === undefined) return base;

	if(Array.isArray(schema)) {
		if(!Array.isArray(value)) return base;
		// Arrays are replaced by the new list (normalized), not merged element-wise
		return conform(schema, value, cache);
	}

	if(is_object(schema)) {
		if(!is_object(value)) return base;

		if(cache.has(value)) return cache.get(value);

		const merged = {};
		cache.set(value, merged);

		const keys = Object.keys(schema);
		for(let i = 0; i < keys.length; i++) {
			// Use base value if available, else create default
			const key = keys[i];
			const base_child = base && has_own(base, key) ? base[key] : conform(schema[key], undefined);

			if(has_own(value, key)) {
				merged[key] = merge(schema[key], base_child, value[key], cache);
			} else {
				merged[key] = base_child;
			}
		}

		return merged;
	}

	return conform(schema, value, cache);
}

export {
	are_equal,
	has_own,
	deep_clone,
	conform,
	merge
};

export default {
	are_equal,
	has_own,
	deep_clone,
	conform,
	merge
};
