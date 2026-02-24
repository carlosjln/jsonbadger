import {is_object} from '#src/utils/value.js';

function has_own(target, key) {
	return Object.prototype.hasOwnProperty.call(target, key);
}

// Optimized deep clone with fallback and circular reference handling
function deep_clone(value, cache = new WeakMap()) {
	// Use native high-performance clone if available
	if(typeof globalThis.structuredClone === 'function') {
		return globalThis.structuredClone(value);
	}

	if(value === null || typeof value !== 'object') {
		return value;
	}

	if(cache.has(value)) {
		return cache.get(value);
	}

	if(Array.isArray(value)) {
		const result = [];
		cache.set(value, result);

		for(let i = 0; i < value.length; i++) {
			result[i] = deep_clone(value[i], cache);
		}

		return result;
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

// TODO: rename this? maybe?
function normalize(schema, value, cache = new WeakMap()) {
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

			result_list.push(normalize(item_schema, item, cache));
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
			result_obj[key] = normalize(schema[key], sub_value, cache);
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
		return normalize(schema, value, cache);
	}

	if(is_object(schema)) {
		if(!is_object(value)) return base;

		if(cache.has(value)) return cache.get(value);

		const merged = {};
		cache.set(value, merged);

		const keys = Object.keys(schema);
		for(let i = 0; i < keys.length; i++) {
			const key = keys[i];
			// Use base value if available, else create default
			const base_child = base && has_own(base, key)
				? base[key]
				: normalize(schema[key], undefined);

			if(has_own(value, key)) {
				merged[key] = merge(schema[key], base_child, value[key], cache);
			} else {
				merged[key] = base_child;
			}
		}

		return merged;
	}

	return normalize(schema, value, cache);
}

export {
	has_own,
	deep_clone,
	normalize,
	merge
};

export default {
	has_own,
	deep_clone,
	normalize,
	merge
};
