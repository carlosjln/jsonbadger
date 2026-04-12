import {describe, expect, test} from '@jest/globals';

import Schema from '#src/schema/schema.js';
import jsonpath_exists_compat_operator from '#src/sql/jsonb/read/operators/jsonpath-exists-compat.js';
import jsonpath_exists_native_operator from '#src/sql/jsonb/read/operators/jsonpath-exists-native.js';
import jsonpath_match_compat_operator from '#src/sql/jsonb/read/operators/jsonpath-match-compat.js';
import jsonpath_match_native_operator from '#src/sql/jsonb/read/operators/jsonpath-match-native.js';

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

	test('accepts $bind_connection(null) for connection-independent identity cases and resets stale runtime artifacts', function () {
		const schema_instance = new Schema({
			name: String
		});

		schema_instance.$runtime.identity = {
			mode: 'stale'
		};

		expect(schema_instance.$bind_connection(null)).toBe(schema_instance);
		expect(Object.getPrototypeOf(schema_instance.$runtime)).toBeNull();
		expect(schema_instance.$runtime.identity).toEqual({
			type: 'bigint',
			format: null,
			mode: 'database',
			requires_explicit_id: false,
			column_sql: 'id BIGSERIAL PRIMARY KEY'
		});
	});

	test('fails clearly when uuid fallback identity is bound without connection capabilities', function () {
		const schema_instance = new Schema({
			name: String
		}, {
			identity: {
				type: 'uuid',
				format: 'uuidv7',
				mode: 'fallback',
				generator: function uuid_generator() {
					return '019631f7-ef80-7c17-8cf0-a9b241551111';
				}
			}
		});

		expect(function bind_without_connection() {
			schema_instance.$bind_connection(null);
		}).toThrow('identity.mode=fallback requires a bound connection');
	});

	test('binds uuid fallback identity to the application path when server uuidv7 support is unavailable', function () {
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

		schema_instance.$bind_connection({
			server_capabilities: {
				supports_uuidv7: false
			}
		});

		expect(schema_instance.$runtime.identity).toEqual({
			type: 'uuid',
			format: 'uuidv7',
			mode: 'application',
			requires_explicit_id: true,
			column_sql: 'id UUID PRIMARY KEY'
		});
	});

	test('binds uuid fallback identity to the database path when server uuidv7 support is available', function () {
		const schema_instance = new Schema({
			name: String
		}, {
			identity: {
				type: 'uuid',
				format: 'uuidv7',
				mode: 'fallback'
			}
		});

		schema_instance.$bind_connection({
			server_capabilities: {
				supports_uuidv7: true
			}
		});

		expect(schema_instance.$runtime.identity).toEqual({
			type: 'uuid',
			format: 'uuidv7',
			mode: 'database',
			requires_explicit_id: false,
			column_sql: 'id UUID PRIMARY KEY DEFAULT uuidv7()'
		});
	});

	test('accepts uuid application identity without a bound connection', function () {
		const generator = function uuid_generator() {
			return '019631f7-ef80-7c17-8cf0-a9b241551111';
		};
		const schema_instance = new Schema({
			name: String
		}, {
			identity: {
				type: 'uuid',
				format: 'uuidv7',
				mode: 'application',
				generator
			}
		});

		schema_instance.$bind_connection(null);

		expect(schema_instance.$runtime.identity).toEqual({
			type: 'uuid',
			format: 'uuidv7',
			mode: 'application',
			requires_explicit_id: true,
			column_sql: 'id UUID PRIMARY KEY'
		});
	});

	test('fails clearly when uuid database identity lacks native server support', function () {
		const schema_instance = new Schema({
			name: String
		}, {
			identity: {
				type: 'uuid',
				format: 'uuidv7',
				mode: 'database'
			}
		});

		expect(function bind_without_native_uuidv7() {
			schema_instance.$bind_connection({
				server_capabilities: {
					supports_uuidv7: false
				}
			});
		}).toThrow('identity.mode=database requires PostgreSQL uuidv7() support');
	});

	test('binds compatibility read operators when server jsonpath support is unavailable', function () {
		const schema_instance = new Schema({
			name: String
		});

		schema_instance.$bind_connection(null);

		expect(schema_instance.$runtime.read_operators.$json_path_exists).toBe(jsonpath_exists_compat_operator);
		expect(schema_instance.$runtime.read_operators.$json_path_match).toBe(jsonpath_match_compat_operator);
	});

	test('binds native read operators when server jsonpath support is available', function () {
		const schema_instance = new Schema({
			name: String
		});

		schema_instance.$bind_connection({
			server_capabilities: {
				supports_jsonpath: true,
				supports_uuidv7: true
			}
		});

		expect(schema_instance.$runtime.read_operators.$json_path_exists).toBe(jsonpath_exists_native_operator);
		expect(schema_instance.$runtime.read_operators.$json_path_match).toBe(jsonpath_match_native_operator);
	});
});
