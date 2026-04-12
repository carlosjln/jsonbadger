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

	test('stores runtime artifacts under an isolated $runtime container', function () {
		const schema_instance = new Schema({
			name: String
		});
		const cloned_schema = schema_instance.clone();

		expect(Object.getPrototypeOf(schema_instance.$runtime)).toBeNull();
		expect(Object.getPrototypeOf(cloned_schema.$runtime)).toBeNull();

		cloned_schema.$runtime.identity = {
			mode: 'database'
		};

		expect(schema_instance.$runtime.identity).toBeUndefined();
		expect(cloned_schema.$runtime.identity).toEqual({
			mode: 'database'
		});
	});

	test('merges identity defaults and schema-level overrides during construction', function () {
		const generator = function uuid_generator() {
			return '019631f7-ef80-7c17-8cf0-a9b241551111';
		};
		const schema_instance = new Schema({
			name: String
		}, {
			identity: {
				type: 'uuid',
				format: 'uuidv7',
				mode: 'fallback',
				generator
			}
		});

		expect(schema_instance.options.identity).toEqual({
			type: 'uuid',
			format: 'uuidv7',
			mode: 'fallback',
			generator
		});
	});

	test('rejects legacy id_strategy input during construction', function () {
		expect(function build_legacy_id_strategy_schema() {
			return new Schema({
				name: String
			}, {
				id_strategy: 'uuidv7'
			});
		}).toThrow('schema_options.id_strategy has been replaced by schema_options.identity');
	});

	test('rejects unsupported static identity combinations during construction', function () {
		expect(function build_invalid_bigint_identity_schema() {
			return new Schema({
				name: String
			}, {
				identity: {
					type: 'bigint',
					format: 'uuidv7'
				}
			});
		}).toThrow('identity.type=bigint requires identity.format=null');

		expect(function build_invalid_application_identity_schema() {
			return new Schema({
				name: String
			}, {
				identity: {
					type: 'uuid',
					format: 'uuidv7',
					mode: 'application'
				}
			});
		}).toThrow('identity.mode=application requires identity.generator');
	});
});
