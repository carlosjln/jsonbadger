import {describe, expect, test} from '@jest/globals';

import Schema from '#src/schema/schema.js';

describe('Schema runtime helpers lifecycle', function () {
	test('registers methods and rejects invalid or duplicate method definitions', function () {
		const schema_instance = new Schema({
			name: String
		});
		function greet() {
			return 'hi';
		}

		expect(schema_instance.add_method('greet', greet)).toBe(schema_instance);
		expect(schema_instance.methods.greet).toBe(greet);

		expect(function register_invalid_name() {
			schema_instance.add_method('bad-name', greet);
		}).toThrow('method_name has invalid characters');

		expect(function register_invalid_implementation() {
			schema_instance.add_method('wave', 'nope');
		}).toThrow('method_implementation must be a function');

		expect(function register_duplicate_name() {
			schema_instance.add_method('greet', function greet_again() {
				return 'again';
			});
		}).toThrow('Schema method "greet" already exists');
	});

	test('collects valid aliases and skips empty or self-referential aliases', function () {
		const schema_instance = new Schema({
			name: {
				type: String,
				alias: 'user_name'
			},
			slug: {
				type: String,
				alias: ''
			},
			title: {
				type: String,
				alias: 'title'
			}
		});

		expect(schema_instance.aliases).toEqual({
			user_name: {
				path: 'name'
			}
		});
	});

	test('rejects aliases that conflict with reserved base fields, schema paths, or sibling aliases', function () {
		expect(function build_invalid_alias_schema() {
			return new Schema({
				name: {
					type: String,
					alias: 'bad-name'
				}
			});
		}).toThrow('alias has invalid characters');

		expect(function build_reserved_alias_schema() {
			return new Schema({
				name: {
					type: String,
					alias: 'id'
				}
			});
		}).toThrow('Alias "id" conflicts with reserved base field "id"');

		expect(function build_path_conflict_alias_schema() {
			return new Schema({
				name: {
					type: String,
					alias: 'profile'
				},
				profile: String
			});
		}).toThrow('Alias "profile" conflicts with existing schema path "profile"');

		expect(function build_duplicate_alias_schema() {
			return new Schema({
				first_name: {
					type: String,
					alias: 'display_name'
				},
				last_name: {
					type: String,
					alias: 'display_name'
				}
			});
		}).toThrow('Duplicate alias "display_name" for paths "first_name" and "last_name"');
	});

	test('normalizes shorthand and inferred field-defined index declarations', function () {
		const schema_instance = new Schema({
			name: {
				type: String,
				index: true
			},
			rank: {
				type: Number,
				index: -1
			},
			meta_tags: {
				type: String,
				index: {
					path: 'meta_tags'
				}
			},
			score: {
				type: Number,
				index: {
					using: 'hash',
					order: -1
				}
			}
		});

		expect(schema_instance.get_indexes()).toEqual([
			{
				using: 'gin',
				path: 'name'
			},
			{
				using: 'btree',
				path: 'rank',
				order: -1
			},
			{
				using: 'gin',
				path: 'meta_tags'
			},
			{
				using: 'btree',
				path: 'score',
				order: -1
			}
		]);
	});

	test('stores valid manual compound indexes and ignores invalid declarations', function () {
		const schema_instance = new Schema({
			name: String,
			type: String
		});

		schema_instance
			.create_index({
				paths: {
					name: 1,
					type: -1
				},
				unique: true,
				name: 'idx_name_type'
			})
			.create_index('asc', 'name')
			.create_index({
				using: 'gin',
				order: -1
			})
			.create_index({
				using: 'btree',
				paths: {
					name: 0
				}
			})
			.create_index({
				using: 'btree',
				path: 'name',
				name: 'bad-name'
			});

		expect(schema_instance.get_indexes()).toEqual([
			{
				using: 'btree',
				paths: {
					name: 1,
					type: -1
				},
				unique: true,
				name: 'idx_name_type'
			},
			{
				using: 'btree',
				path: 'name',
				order: 1
			}
		]);
	});

	test('ignores uninferable and invalid path-based index declarations', function () {
		const schema_instance = new Schema({
			name: String
		});

		schema_instance
			.create_index({})
			.create_index({
				using: 'gin',
				path: 'bad-path!'
			})
			.create_index({
				using: 'btree',
				path: 'bad-path!'
			})
			.create_index({
				using: 'btree',
				paths: {
					'bad-path!': 1
				}
			});

		expect(schema_instance.get_indexes()).toEqual([]);
	});
});
