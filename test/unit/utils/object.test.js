import {describe, expect, test} from '@jest/globals';

import object_utils, {deep_clone, has_own, merge, normalize} from '#src/utils/object.js';

function run_without_structured_clone(callback) {
	const original_structured_clone = globalThis.structuredClone;

	globalThis.structuredClone = undefined;

	try {
		return callback();
	} finally {
		globalThis.structuredClone = original_structured_clone;
	}
}

describe('utils/object', function () {
	test('exports expected utility functions and has_own only checks own properties', function () {
		const base_object = {inherited_flag: true};
		const child_object = Object.create(base_object);
		child_object.own_flag = true;

		expect(object_utils.has_own).toBe(has_own);
		expect(object_utils.deep_clone).toBe(deep_clone);
		expect(object_utils.normalize).toBe(normalize);
		expect(object_utils.merge).toBe(merge);
		expect(has_own(child_object, 'own_flag')).toBe(true);
		expect(has_own(child_object, 'inherited_flag')).toBe(false);
	});

	test('deep_clone clones nested structures with native structuredClone when available', function () {
		const value = {
			profile: {name: 'Alice'},
			tags: ['a', 'b']
		};
		const cloned_value = deep_clone(value);

		expect(cloned_value).toEqual(value);
		expect(cloned_value).not.toBe(value);
		expect(cloned_value.profile).not.toBe(value.profile);
		expect(cloned_value.tags).not.toBe(value.tags);
	});

	test('deep_clone fallback handles primitives, arrays, objects and circular references', function () {
		run_without_structured_clone(function () {
			const shared_child = {id: 1};
			const source_value = {
				shared_a: shared_child,
				shared_b: shared_child,
				list: [shared_child, 2]
			};
			source_value.self = source_value;

			expect(deep_clone(null)).toBeNull();
			expect(deep_clone('ok')).toBe('ok');

			const cloned_value = deep_clone(source_value);

			expect(cloned_value).not.toBe(source_value);
			expect(cloned_value.self).toBe(cloned_value);
			expect(cloned_value.shared_a).not.toBe(shared_child);
			expect(cloned_value.shared_a).toBe(cloned_value.shared_b);
			expect(cloned_value.list[0]).toBe(cloned_value.shared_a);
			expect(cloned_value.list).not.toBe(source_value.list);
		});
	});

	test('normalize handles array schemas including empty schema, invalid items and circular array cache reuse', function () {
		const object_array_schema = [{name: ''}];
		const normalized_empty_schema = normalize([], ['anything']);
		const normalized_non_array_input = normalize([String], 'nope');
		const normalized_object_list = normalize(object_array_schema, [
			{name: '  Alice  '},
			'not-an-object',
			{name: 'Bob'}
		]);

		expect(normalized_empty_schema).toEqual([]);
		expect(normalized_non_array_input).toEqual([]);
		expect(normalized_object_list).toEqual([
			{name: 'Alice'},
			{name: 'Bob'}
		]);

		const circular_list = [];
		circular_list.push(circular_list);

		const circular_result = normalize([[String]], circular_list);
		expect(circular_result[0]).toBe(circular_result);
	});

	test('normalize handles object schemas, defaults, sanitization and circular object cache reuse', function () {
		const schema = {
			name: '',
			age: 0,
			active: false,
			meta: {
				city: '',
				zip: 0
			}
		};

		const normalized_value = normalize(schema, {
			name: '  Alice  ',
			age: '12.9',
			active: 1,
			meta: {
				city: '  San Juan  ',
				zip: '00901',
				extra: 'ignored'
			},
			extra_root: 'ignored'
		});

		const normalized_defaults = normalize(schema, 'not-an-object');

		expect(normalized_value).toEqual({
			name: 'Alice',
			age: 12,
			active: true,
			meta: {
				city: 'San Juan',
				zip: 901
			}
		});

		expect(normalized_defaults).toEqual({
			name: '',
			age: 0,
			active: false,
			meta: {
				city: '',
				zip: 0
			}
		});

		const circular_schema = {self: {}};
		const circular_input = {};
		circular_input.self = circular_input;

		const circular_result = normalize(circular_schema, circular_input);
		expect(circular_result.self).toBe(circular_result);
	});

	test('normalize handles primitive defaults and fallback cloning behavior', function () {
		run_without_structured_clone(function () {
			const object_default_schema = null;
			const symbol_schema = Symbol('default');

			expect(normalize('default', undefined)).toBe('default');
			expect(normalize(10, '4.9')).toBe(4);
			expect(normalize(10, '-5')).toBe(10);
			expect(normalize(1.5, '2.75')).toBe(2.75);
			expect(normalize(7, 'not-a-number')).toBe(7);
			expect(normalize(false, 'value')).toBe(true);
			expect(normalize(object_default_schema, undefined)).toBeNull();
			expect(normalize(symbol_schema, 'present')).toBe(symbol_schema);
		});
	});

	test('merge returns base for unsupported shapes and merges object schemas using defaults and recursion', function () {
		const schema = {
			name: '',
			count: 0,
			tags: [''],
			settings: {
				enabled: false,
				threshold: 0
			}
		};

		const base_value = {
			name: 'base-name',
			settings: {
				enabled: true,
				threshold: 5
			}
		};

		const patch_value = {
			count: '2.8',
			tags: ['  a  ', 'b'],
			settings: {
				threshold: '9'
			},
			extra_key: 'ignored'
		};

		expect(merge(schema, base_value, undefined)).toBe(base_value);
		expect(merge([''], ['base'], 'not-array')).toEqual(['base']);
		expect(merge({name: ''}, {name: 'base'}, 'not-object')).toEqual({name: 'base'});
		expect(merge('x', 'base', '  next  ')).toBe('next');

		const merged_value = merge(schema, base_value, patch_value);
		expect(merged_value).toEqual({
			name: 'base-name',
			count: 2,
			tags: ['a', 'b'],
			settings: {
				enabled: true,
				threshold: 9
			}
		});

		expect(merged_value).not.toBe(base_value);
		expect(merged_value.settings).not.toBe(base_value.settings);
	});

	test('merge reuses cache for circular object patches', function () {
		const schema = {self: {}};
		const base_value = {self: {}};
		const patch_value = {};
		patch_value.self = patch_value;

		const merged_value = merge(schema, base_value, patch_value);
		expect(merged_value.self).toBe(merged_value);
	});
});
