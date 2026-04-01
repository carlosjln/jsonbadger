import {describe, expect, test} from '@jest/globals';

import object_utils, {are_equal, conform, deep_clone, get_callable, has_own, merge, to_plain_object} from '#src/utils/object.js';

function run_without_structured_clone(callback) {
	const original_structured_clone = globalThis.structuredClone;

	globalThis.structuredClone = undefined;

	try {
		return callback();
	} finally {
		globalThis.structuredClone = original_structured_clone;
	}
}

function CustomInstance(label) {
	this.label = label;
}

describe('utils/object', function () {
	test('exports expected utility functions and has_own only checks own properties', function () {
		const base_object = {inherited_flag: true};
		const child_object = Object.create(base_object);
		child_object.own_flag = true;

		expect(object_utils.are_equal).toBe(are_equal);
		expect(object_utils.has_own).toBe(has_own);
		expect(object_utils.get_callable).toBe(get_callable);
		expect(object_utils.deep_clone).toBe(deep_clone);
		expect(object_utils.to_plain_object).toBe(to_plain_object);
		expect(object_utils.conform).toBe(conform);
		expect(object_utils.merge).toBe(merge);
		expect(has_own(child_object, 'own_flag')).toBe(true);
		expect(has_own(child_object, 'inherited_flag')).toBe(false);
	});

	test('get_callable returns direct function candidates, object methods, or null', function () {
		function fallback_serializer() {
			return 'fallback';
		}

		const target = {
			toJSON() {
				return 'json';
			}
		};

		expect(get_callable(target, fallback_serializer, 'toJSON')).toBe(fallback_serializer);
		expect(get_callable(target, 'to_json', 'toJSON')).toBe(target.toJSON);
		expect(get_callable(target, 'missing')).toBeNull();
	});

	test('are_equal handles primitives, arrays, dates, objects, and circular references', function () {
		const shared_child = {id: 1};
		const circular_a = {profile: shared_child};
		const circular_b = {profile: {id: 1}};
		circular_a.self = circular_a;
		circular_b.self = circular_b;

		expect(are_equal('a', 'a')).toBe(true);
		expect(are_equal(NaN, NaN)).toBe(true);
		expect(are_equal('a', 'b')).toBe(false);
		expect(are_equal([], {})).toBe(false);
		expect(are_equal([1, 2], [1])).toBe(false);
		expect(are_equal([1, 2], [1, 3])).toBe(false);
		expect(are_equal([1, {ok: true}], [1, {ok: true}])).toBe(true);
		expect(are_equal(new Date('2026-03-08T10:00:00.000Z'), new Date('2026-03-08T10:00:00.000Z'))).toBe(true);
		expect(are_equal(new Date('2026-03-08T10:00:00.000Z'), new Date('2026-03-08T11:00:00.000Z'))).toBe(false);
		expect(are_equal(new Date('2026-03-08T10:00:00.000Z'), {})).toBe(false);
		expect(are_equal(new Date('2026-03-08T10:00:00.000Z'), '2026-03-08T10:00:00.000Z')).toBe(false);
		expect(are_equal({name: 'Alice'}, {name: 'Alice', extra: true})).toBe(false);
		expect(are_equal({name: 'Alice'}, {city: 'San Juan'})).toBe(false);
		expect(are_equal({name: 'Alice'}, {name: 'Bob'})).toBe(false);
		expect(are_equal(circular_a, circular_b)).toBe(true);
		expect(are_equal(circular_a, {profile: {id: 2}, self: circular_a})).toBe(false);
	});

	test('deep_clone clones nested plain structures', function () {
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

	test('deep_clone preserves function-bearing objects without flattening nested data', function () {
		const validate = function () {
			return true;
		};
		const value = {
			options: {
				validate: validate,
				nested: {
					enabled: true
				}
			}
		};

		const cloned_value = deep_clone(value);

		expect(cloned_value).toEqual(value);
		expect(cloned_value).not.toBe(value);
		expect(cloned_value.options).not.toBe(value.options);
		expect(cloned_value.options.nested).not.toBe(value.options.nested);
		expect(cloned_value.options.validate).toBe(validate);
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

	test('deep_clone fallback preserves RegExp semantics and custom instances', function () {
		run_without_structured_clone(function () {
			const custom_instance = new CustomInstance('child');
			const source_value = {
				validate: function () {
					return true;
				},
				match: /^[a-z]+$/gi,
				custom_instance: custom_instance
			};

			const cloned_value = deep_clone(source_value);

			expect(cloned_value).not.toBe(source_value);
			expect(cloned_value.match).toBeInstanceOf(RegExp);
			expect(cloned_value.match).not.toBe(source_value.match);
			expect(cloned_value.match.source).toBe(source_value.match.source);
			expect(cloned_value.match.flags).toBe(source_value.match.flags);
			expect(cloned_value.custom_instance).toBe(custom_instance);
		});
	});

	test('deep_clone preserves Date Buffer Map and Set semantics', function () {
		const created_at = new Date('2026-03-06T10:00:00.000Z');
		const file_buffer = Buffer.from('jsonbadger');
		const map_value = new Map([
			['profile', {name: 'Alice'}]
		]);
		const set_value = new Set([
			{tag: 'vip'}
		]);
		const source_value = {
			created_at: created_at,
			file_buffer: file_buffer,
			map_value: map_value,
			set_value: set_value
		};

		const cloned_value = deep_clone(source_value);
		const cloned_map_entry = cloned_value.map_value.get('profile');
		const original_map_entry = map_value.get('profile');
		const cloned_set_entry = [...cloned_value.set_value][0];
		const original_set_entry = [...set_value][0];

		expect(cloned_value).not.toBe(source_value);

		expect(cloned_value.created_at).toBeInstanceOf(Date);
		expect(cloned_value.created_at).not.toBe(created_at);
		expect(cloned_value.created_at.getTime()).toBe(created_at.getTime());

		expect(Buffer.isBuffer(cloned_value.file_buffer)).toBe(true);
		expect(cloned_value.file_buffer).not.toBe(file_buffer);
		expect(cloned_value.file_buffer.equals(file_buffer)).toBe(true);

		expect(cloned_value.map_value).toBeInstanceOf(Map);
		expect(cloned_value.map_value).not.toBe(map_value);
		expect(cloned_map_entry).toEqual(original_map_entry);
		expect(cloned_map_entry).not.toBe(original_map_entry);

		expect(cloned_value.set_value).toBeInstanceOf(Set);
		expect(cloned_value.set_value).not.toBe(set_value);
		expect(cloned_set_entry).toEqual(original_set_entry);
		expect(cloned_set_entry).not.toBe(original_set_entry);
	});

	test('to_plain_object converts collections, typed arrays, custom serializers, and circular references', function () {
		const typed_array = new Uint8Array([1, 2, 3]);
		const shared_item = {name: 'Alice'};
		const source_value = {
			created_at: new Date('2026-03-06T10:00:00.000Z'),
			set_value: new Set([shared_item]),
			map_value: new Map([
				['profile', shared_item],
				[7, {score: 12}]
			]),
			typed_array,
			list: [shared_item],
			custom_value: {
				toJSON() {
					return {
						nested: 'ok'
					};
				}
			}
		};
		source_value.self = source_value;

		const plain_value = to_plain_object(source_value);

		expect(to_plain_object(null)).toBeNull();
		expect(to_plain_object('ok')).toBe('ok');
		expect(plain_value.created_at).toBeInstanceOf(Date);
		expect(plain_value.created_at.getTime()).toBe(source_value.created_at.getTime());
		expect(plain_value.set_value).toEqual([
			{name: 'Alice'}
		]);
		expect(plain_value.map_value).toEqual({
			7: {
				score: 12
			},
			profile: {
				name: 'Alice'
			}
		});
		expect(plain_value.typed_array).toEqual([1, 2, 3]);
		expect(plain_value.list).toEqual([
			{name: 'Alice'}
		]);
		expect(plain_value.custom_value).toEqual({
			nested: 'ok'
		});
		expect(plain_value.self).toBe(plain_value);
	});

	test('conform handles array schemas including empty schema, invalid items and circular array cache reuse', function () {
		const object_array_schema = [{name: ''}];
		const normalized_empty_schema = conform([], ['anything']);
		const normalized_non_array_input = conform([String], 'nope');
		const normalized_object_list = conform(object_array_schema, [
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

		const circular_result = conform([[String]], circular_list);
		expect(circular_result[0]).toBe(circular_result);
	});

	test('conform handles object schemas, defaults, sanitization and circular object cache reuse', function () {
		const schema = {
			name: '',
			age: 0,
			active: false,
			meta: {
				city: '',
				zip: 0
			}
		};

		const normalized_value = conform(schema, {
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

		const normalized_defaults = conform(schema, 'not-an-object');

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

		const circular_result = conform(circular_schema, circular_input);
		expect(circular_result.self).toBe(circular_result);
	});

	test('conform handles primitive defaults and fallback cloning behavior', function () {
		run_without_structured_clone(function () {
			const object_default_schema = null;
			const symbol_schema = Symbol('default');

			expect(conform('default', undefined)).toBe('default');
			expect(conform(10, '4.9')).toBe(4);
			expect(conform(10, '-5')).toBe(10);
			expect(conform(1.5, '2.75')).toBe(2.75);
			expect(conform(7, 'not-a-number')).toBe(7);
			expect(conform(false, 'value')).toBe(true);
			expect(conform(object_default_schema, undefined)).toBeNull();
			expect(conform(symbol_schema, 'present')).toBe(symbol_schema);
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
