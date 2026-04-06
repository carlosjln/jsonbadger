import {describe, expect, test} from '@jest/globals';

import Schema from '#src/schema/schema.js';

describe('Schema construction lifecycle', function () {
	test('injects base fields into the compiled schema without mutating the input definition', function () {
		const schema_definition = {
			name: String
		};
		const schema_instance = new Schema(schema_definition);

		expect(schema_definition).toEqual({
			name: String
		});
		expect(Object.keys(schema_instance.$field_types)).toEqual(
			expect.arrayContaining(['id', 'created_at', 'updated_at', 'name'])
		);
	});

	test('normalizes slug options and exposes slug helpers through the schema instance', function () {
		const schema_instance = new Schema({
			name: String,
			settings: {
				theme: String
			},
			status: {
				last_seen_at: Date
			}
		}, {
			default_slug: 'payload',
			slugs: ['settings', 'payload', 'settings', 42, 'status']
		});

		const extra_slugs = schema_instance.get_extra_slugs();

		expect(schema_instance.get_default_slug()).toBe('payload');
		expect(extra_slugs).toEqual(['settings', 'status']);
		expect(schema_instance.get_slugs()).toEqual(['payload', 'settings', 'status']);

		extra_slugs.push('rogue');
		expect(schema_instance.get_extra_slugs()).toEqual(['settings', 'status']);
	});

	test('slug helpers tolerate defensive non-array mutation on schema options', function () {
		const schema_instance = new Schema({
			name: String
		}, {
			default_slug: 'payload',
			slugs: ['settings']
		});

		schema_instance.options.slugs = null;

		expect(schema_instance.get_extra_slugs()).toEqual([]);
		expect(schema_instance.get_slugs()).toEqual(['payload']);
	});

	test('normalizes non-array slug options to an empty list during schema construction', function () {
		const schema_instance = new Schema({
			name: String
		}, {
			default_slug: 'payload',
			slugs: 'settings'
		});

		expect(schema_instance.options.slugs).toEqual([]);
		expect(schema_instance.get_extra_slugs()).toEqual([]);
		expect(schema_instance.get_slugs()).toEqual(['payload']);
	});

	test('collects path-defined indexes and returns clones from get_indexes', function () {
		const schema_instance = new Schema({
			tags: {
				type: [String],
				index: true
			}
		});

		const indexes = schema_instance.get_indexes();
		expect(indexes).toEqual([
			{
				using: 'gin',
				path: 'tags'
			}
		]);

		indexes[0].path = 'mutated';
		expect(schema_instance.get_indexes()).toEqual([
			{
				using: 'gin',
				path: 'tags'
			}
		]);
	});

	test('returns nested path clones from get_indexes when compound btree indexes are present', function () {
		const schema_instance = new Schema({
			name: String,
			type: String
		});

		schema_instance.create_index({
			using: 'btree',
			paths: {
				name: 1,
				type: -1
			},
			name: 'idx_name_type'
		});

		const indexes = schema_instance.get_indexes();
		indexes[0].paths.name = -1;
		indexes[0].name = 'mutated';

		expect(schema_instance.get_indexes()).toEqual([
			{
				using: 'btree',
				paths: {
					name: 1,
					type: -1
				},
				name: 'idx_name_type'
			}
		]);
	});

	test('exposes path helpers for fields, object paths, and array roots', function () {
		const schema_instance = new Schema({
			profile: {
				city: String
			},
			tags: [String]
		});

		expect(schema_instance.get_path('profile.city').instance).toBe('String');
		expect(schema_instance.get_path('missing')).toBeNull();
		expect(schema_instance.get_path_type('profile')).toBe('object');
		expect(schema_instance.get_path_type('profile.city')).toBe('String');
		expect(schema_instance.is_array_root('tags.items')).toBe(true);
		expect(schema_instance.is_array_root('profile.city')).toBe(false);
	});
});
