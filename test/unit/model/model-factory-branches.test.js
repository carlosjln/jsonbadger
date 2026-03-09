import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const ensure_table_mock = jest.fn();
const ensure_index_mock = jest.fn();
const ensure_schema_mock = jest.fn();
const sql_runner_mock = jest.fn();
const assert_id_strategy_capability_mock = jest.fn();

jest.unstable_mockModule('#src/migration/ensure-table.js', function () {
	return {
		default: ensure_table_mock
	};
});

jest.unstable_mockModule('#src/migration/ensure-index.js', function () {
	return {
		default: ensure_index_mock
	};
});

jest.unstable_mockModule('#src/migration/ensure-schema.js', function () {
	return {
		default: ensure_schema_mock
	};
});

jest.unstable_mockModule('#src/sql/sql-runner.js', function () {
	return {
		default: sql_runner_mock
	};
});

jest.unstable_mockModule('#src/connection/server-capabilities.js', function () {
	return {
		assert_id_strategy_capability: assert_id_strategy_capability_mock
	};
});

const {default: QueryBuilder} = await import('#src/query/query-builder.js');
const {default: QueryError} = await import('#src/errors/query-error.js');
const {default: Schema} = await import('#src/schema/schema.js');
const {default: model} = await import('#src/model/factory/index.js');

describe('model-factory branch behavior', function () {
	beforeEach(function () {
		ensure_table_mock.mockReset();
		ensure_index_mock.mockReset();
		ensure_schema_mock.mockReset();
		sql_runner_mock.mockReset();
		assert_id_strategy_capability_mock.mockReset();

		ensure_table_mock.mockResolvedValue(undefined);
		ensure_index_mock.mockResolvedValue(undefined);
		ensure_schema_mock.mockResolvedValue(undefined);
		sql_runner_mock.mockResolvedValue({
			rows: [{
				id: '5',
				data: {ok: true},
				created_at: new Date('2026-02-27T10:00:00.000Z'),
				updated_at: new Date('2026-02-27T11:00:00.000Z')
			}]
		});
	});

	describe('construction and ownership', function () {
		test('creates default document data and returns QueryBuilder instances for read methods', function () {
			const schema_instance = build_schema_stub();
			const user_model = create_model(schema_instance);
			const doc = new user_model();
			const find_query = user_model.find();
			const find_one_query = user_model.find_one();
			const count_query = user_model.count_documents();

			expect(doc.data).toEqual({});
			expect(find_query).toBeInstanceOf(QueryBuilder);
			expect(find_one_query).toBeInstanceOf(QueryBuilder);
			expect(count_query).toBeInstanceOf(QueryBuilder);
			expect(find_query.operation_name).toBe('find');
			expect(find_one_query.operation_name).toBe('find_one');
			expect(count_query.operation_name).toBe('count_documents');
		});

		test('stores connection ownership and logical model name when provided', function () {
			const schema_instance = build_schema_stub();
			const connection = {
				options: {
					id_strategy: 'uuidv7',
					auto_index: true
				},
				server_capabilities: null
			};
			const user_model = create_model(schema_instance, {}, connection, 'User');

			expect(user_model.connection).toBe(connection);
			expect(user_model.model_name).toBe('User');
			expect(user_model.schema_instance).toBe(schema_instance);
			expect(user_model.resolve_id_strategy()).toBe('uuidv7');
			expect(user_model.connection.options.auto_index).toBe(true);
		});

		test('uses connection-owned server capabilities when asserting id strategy support', function () {
			const schema_instance = build_schema_stub();
			const connection = {
				options: {
					id_strategy: 'uuidv7',
					auto_index: false
				},
				server_capabilities: {
					supports_uuidv7: true
				}
			};
			const user_model = create_model(schema_instance, {}, connection, 'User');

			expect(user_model.assert_id_strategy_supported()).toBe('uuidv7');
			expect(assert_id_strategy_capability_mock).toHaveBeenCalledWith('uuidv7', {
				supports_uuidv7: true
			});
		});

		test('resolve_id_strategy uses model override and falls back to connection default', function () {
			const connection = create_connection({id_strategy: 'uuidv7'});

			const override_model = create_model(build_schema_stub(), {
				table_name: 'override_users',
				id_strategy: 'bigserial'
			}, connection, 'OverrideUser');

			const fallback_model = create_model(build_schema_stub(), {
				table_name: 'fallback_users'
			}, connection, 'FallbackUser');

			expect(override_model.resolve_id_strategy()).toBe('bigserial');
			expect(fallback_model.resolve_id_strategy()).toBe('uuidv7');
		});

		test('allows id/timestamp schema paths and rejects public data_column override', function () {
			expect(function create_id_path_model() {
				model(new Schema({id: String}), {table_name: 'users'});
			}).not.toThrow();

			expect(function create_created_at_path_model() {
				model(new Schema({created_at: Date}), {table_name: 'users'});
			}).not.toThrow();

			expect(function create_updated_at_path_model() {
				model(new Schema({updated_at: Date}), {table_name: 'users'});
			}).not.toThrow();

			expect(function create_public_data_column_model() {
				model(new Schema({name: String}), {
					table_name: 'users',
					data_column: 'payload'
				});
			}).toThrow('data_column');
		});
	});

	describe('read helpers', function () {
		test('find_by_id returns a find_one QueryBuilder scoped by id', function () {
			const user_model = create_model(new Schema({name: String}));
			const query_builder = user_model.find_by_id('abc-123');

			expect(query_builder).toBeInstanceOf(QueryBuilder);
			expect(query_builder.operation_name).toBe('find_one');
			expect(query_builder.base_filter).toEqual({id: 'abc-123'});
		});
	});

	describe('create', function () {
		test('Model.create delegates to document save semantics for single and array inputs', async function () {
			const user_model = create_model(new Schema({name: String}));

			sql_runner_mock
				.mockResolvedValueOnce({
					rows: [{
						id: '11',
						data: {name: 'one'},
						created_at: new Date('2026-02-27T10:00:00.000Z'),
						updated_at: new Date('2026-02-27T11:00:00.000Z')
					}]
				})
				.mockResolvedValueOnce({
					rows: [{
						id: '12',
						data: {name: 'two'},
						created_at: new Date('2026-02-27T12:00:00.000Z'),
						updated_at: new Date('2026-02-27T13:00:00.000Z')
					}]
				})
				.mockResolvedValueOnce({
					rows: [{
						id: '13',
						data: {name: 'three'},
						created_at: new Date('2026-02-27T14:00:00.000Z'),
						updated_at: new Date('2026-02-27T15:00:00.000Z')
					}]
				});

			const one = await user_model.create({name: 'one'});
			const many = await user_model.create([{name: 'two'}, {name: 'three'}]);

			expect(one).toBeInstanceOf(user_model);
			expect(one.name).toBe('one');
			expect(Array.isArray(many)).toBe(true);
			expect(many).toHaveLength(2);
			expect(many[0]).toBeInstanceOf(user_model);
			expect(many[1]).toBeInstanceOf(user_model);
			expect(many[0].name).toBe('two');
			expect(many[1].name).toBe('three');
			expect(sql_runner_mock).toHaveBeenCalledTimes(3);
		});
	});

	describe('ensure_index', function () {
		test('creates table and applies schema indexes using the owning connection defaults', async function () {
			const connection = create_connection({id_strategy: 'uuidv7'});

			const schema_instance = build_schema_stub({
				indexes: [{using: 'gin', path: 'name'}]
			});

			const user_model = create_model(schema_instance, {}, connection, 'User');

			await user_model.ensure_index();

			expect(ensure_table_mock).toHaveBeenCalledWith({
				table_name: 'users',
				data_column: 'data',
				id_strategy: 'uuidv7',
				connection
			});
			expect(ensure_index_mock).toHaveBeenCalledWith({
				table_name: 'users',
				index_definition: {using: 'gin', path: 'name'},
				data_column: 'data',
				connection
			});
		});

		test('forwards model-owned connection context through ensure_index and ensure_schema', async function () {
			const connection = {
				pool_instance: {query: jest.fn()},
				options: {id_strategy: 'bigserial', auto_index: true}
			};
			const schema_instance = build_schema_stub({
				indexes: [{using: 'gin', path: 'name'}]
			});
			const user_model = create_model(schema_instance, {}, connection, 'User');

			await user_model.ensure_index();
			await user_model.ensure_schema();

			expect(ensure_table_mock).toHaveBeenCalledWith({
				table_name: 'users',
				data_column: 'data',
				id_strategy: 'bigserial',
				connection
			});
			expect(ensure_index_mock).toHaveBeenCalledWith({
				table_name: 'users',
				index_definition: {using: 'gin', path: 'name'},
				data_column: 'data',
				connection
			});
			expect(ensure_schema_mock).toHaveBeenCalledWith('users', 'data', schema_instance, 'bigserial', connection);
		});
	});

	describe('update_one', function () {
		test('returns null when no row matches and accepts null query_filter', async function () {
			sql_runner_mock.mockResolvedValueOnce({rows: []});
			const user_model = create_model(new Schema({active: Boolean}));

			const result = await user_model.update_one(null, {
				$set: {
					active: true
				}
			});

			expect(result).toBeNull();
			expect(sql_runner_mock.mock.calls[0][0]).toContain('WHERE TRUE');
		});

		test('supports insert-only updates without a set definition', async function () {
			const user_model = create_model(new Schema({tags: [String]}));

			await user_model.update_one({}, {
				$insert: {
					'tags.0': 'alpha'
				}
			});

			expect(sql_runner_mock).toHaveBeenCalledTimes(1);
			expect(sql_runner_mock.mock.calls[0][0]).toContain('jsonb_insert(');
		});

		test('skips schema path casting when schema.path is unavailable', async function () {
			const schema_without_path = build_schema_stub({
				path: undefined
			});
			const user_model = create_model(schema_without_path);

			await user_model.update_one({}, {
				$set: {
					payload: {ok: true}
				}
			});

			expect(sql_runner_mock).toHaveBeenCalledTimes(1);
			expect(sql_runner_mock.mock.calls[0][1]).toEqual(['{"ok":true}']);
		});

		test('rejects missing supported operators', async function () {
			const user_model = create_model(new Schema({name: String}));

			await expect(user_model.update_one({}, undefined)).rejects.toThrow('update_one requires at least one supported update operator');
			expect(ensure_table_mock).not.toHaveBeenCalled();
		});

		test('rejects invalid operator payload types', async function () {
			const user_model = create_model(new Schema({name: String}));

			await expect(user_model.update_one({}, {$set: 1})).rejects.toThrow('update_definition.$set must be an object');
			await expect(user_model.update_one({}, {$insert: 1})).rejects.toThrow('update_definition.$insert must be an object');
			await expect(user_model.update_one({}, {$set_lax: 1})).rejects.toThrow('update_definition.$set_lax must be an object');
		});

		test('rejects exact duplicate update paths across operators', async function () {
			const user_model = create_model(new Schema({payload: {}}));

			await expect(user_model.update_one({}, {
				$set: {
					'payload.value': 'a'
				},
				$insert: {
					'payload.value': 'b'
				}
			})).rejects.toThrow('Conflicting update paths');
		});

		test('rejects invalid update path formats', async function () {
			const user_model = create_model(new Schema({payload: {}}));

			await expect(user_model.update_one({}, {
				$set: {
					'payload..value': 1
				}
			})).rejects.toThrow('Update path contains an empty segment');

			await expect(user_model.update_one({}, {
				$set: {
					'1payload.value': 1
				}
			})).rejects.toThrow('Update path root segment has invalid characters');

			await expect(user_model.update_one({}, {
				$set: {
					'payload.bad-seg': 1
				}
			})).rejects.toThrow('Update path contains an invalid nested segment');
		});

		test('rejects id field mutation paths', async function () {
			const user_model = create_model(new Schema({name: String}));

			await expect(user_model.update_one({}, {
				$set: {
					id: 'next-id'
				}
			})).rejects.toThrow('Update path targets read-only id field');
		});

		test('rejects timestamp fields outside $set updates', async function () {
			const user_model = create_model(new Schema({name: String}));

			await expect(user_model.update_one({}, {
				$insert: {
					updated_at: '2026-03-03T10:00:00.000Z'
				}
			})).rejects.toThrow('Timestamp fields only support $set updates');

			await expect(user_model.update_one({}, {
				$set_lax: {
					created_at: {
						value: '2026-03-03T10:00:00.000Z'
					}
				}
			})).rejects.toThrow('Timestamp fields only support $set updates');
		});

		test('rejects nested timestamp update paths', async function () {
			const user_model = create_model(new Schema({name: String}));

			await expect(user_model.update_one({}, {
				$set: {
					'updated_at.value': '2026-03-03T10:00:00.000Z'
				}
			})).rejects.toThrow('Timestamp fields only support top-level update paths');
		});

		test('auto-updates updated_at unless caller provides it', async function () {
			const user_model = create_model(new Schema({name: String}));

			await user_model.update_one({name: 'john'}, {
				$set: {
					name: 'jane'
				}
			});

			const auto_timestamp_sql = sql_runner_mock.mock.calls[0][0];
			expect(auto_timestamp_sql).toContain('updated_at = NOW()');

			sql_runner_mock.mockClear();

			await user_model.update_one({name: 'john'}, {
				$set: {
					name: 'jane',
					updated_at: '2026-03-03T10:00:00.000Z'
				}
			});

			const explicit_timestamp_sql = sql_runner_mock.mock.calls[0][0];
			expect(explicit_timestamp_sql).not.toContain('updated_at = NOW()');
			expect(explicit_timestamp_sql).toContain('updated_at =');
			expect(sql_runner_mock.mock.calls[0][1]).toEqual(
				expect.arrayContaining(['2026-03-03T10:00:00.000Z'])
			);
		});

		test('forwards model-owned connection context through update_one queries', async function () {
			const connection = {
				pool_instance: {query: jest.fn()},
				options: {
					debug: false,
					id_strategy: 'bigserial',
					auto_index: false
				}
			};
			const user_model = create_model(new Schema({name: String}), {}, connection, 'User');

			await user_model.update_one({name: 'john'}, {
				$set: {
					name: 'jane'
				}
			});

			expect(sql_runner_mock).toHaveBeenCalledWith(expect.any(String), expect.any(Array), connection);
		});

		test('passes through explicit created_at updates into row assignments', async function () {
			const user_model = create_model(new Schema({name: String}));

			await user_model.update_one({name: 'john'}, {
				$set: {
					name: 'jane',
					created_at: '2026-03-03T09:00:00.000Z'
				}
			});

			const update_sql = sql_runner_mock.mock.calls[0][0];
			const update_parameters = sql_runner_mock.mock.calls[0][1];

			expect(update_sql).toContain('created_at =');
			expect(update_parameters).toEqual(
				expect.arrayContaining(['2026-03-03T09:00:00.000Z'])
			);
		});

		test('rejects invalid timestamp updates', async function () {
			const user_model = create_model(new Schema({name: String}));

			await expect(user_model.update_one({name: 'john'}, {
				$set: {
					updated_at: 'not-a-date'
				}
			})).rejects.toThrow('Invalid timestamp value for update path');
		});
	});

	describe('delete_one', function () {
		test('rethrows non-QueryError failures', async function () {
			const user_model = create_model(new Schema({name: String}));
			sql_runner_mock.mockRejectedValueOnce(new Error('db down'));

			await expect(user_model.delete_one({name: 'a'})).rejects.toThrow('db down');
		});

		test('rethrows QueryError when cause is not a string', async function () {
			const user_model = create_model(new Schema({name: String}));

			sql_runner_mock.mockRejectedValueOnce(new QueryError('SQL execution failed', {
				cause: {message: 'not string'}
			}));

			await expect(user_model.delete_one({name: 'a'})).rejects.toThrow('SQL execution failed');
		});
	});

	describe('from', function () {
		test('builds a new document from schema-defined payload and top-level base fields', function () {
			const user_model = create_model(new Schema({
				name: {type: String, set: function (value) {return value.trim();}},
				age: Number
			}));

			const imported_document = user_model.from({
				name: '  maria  ',
				age: '29',
				created_at: '2026-03-03T08:00:00.000Z'
			});

			expect(imported_document).toBeInstanceOf(user_model);
			expect(imported_document.is_new).toBe(true);
			expect(imported_document.data).toEqual({
				name: 'maria',
				age: 29
			});
			expect(imported_document.created_at).toBeInstanceOf(Date);
			expect(imported_document.created_at.toISOString()).toBe('2026-03-03T08:00:00.000Z');
		});

		test('uses source.data as payload input and ignores outer non-base payload keys', function () {
			const user_model = create_model(new Schema({
				name: String,
				age: Number
			}));

			const imported_document = user_model.from({
				id: '7',
				name: 'outer-ignore',
				data: {
					name: 'maria',
					age: '29'
				}
			});

			expect(imported_document.data).toEqual({
				name: 'maria',
				age: 29
			});
			expect(imported_document.id).toBe('7');
		});

		test('keeps unknown payload keys when strict is false', function () {
			const user_model = create_model(new Schema({
				name: String
			}));

			const imported_document = user_model.from({
				name: 'maria',
				role: 'admin',
				profile: {
					city: 'miami'
				}
			}, {
				strict: false
			});

			expect(imported_document.data).toEqual({
				name: 'maria',
				role: 'admin',
				profile: {
					city: 'miami'
				}
			});
		});

		test('falls back to schema-level strict when local options are omitted', function () {
			const user_model = create_model(new Schema({
				name: String
			}, {
				strict: false
			}));

			const imported_document = user_model.from({
				name: 'maria',
				role: 'admin'
			});

			expect(imported_document.data).toEqual({
				name: 'maria',
				role: 'admin'
			});
		});

		test('lets local strict override schema-level strict', function () {
			const user_model = create_model(new Schema({
				name: String
			}, {
				strict: false
			}));

			const imported_document = user_model.from({
				name: 'maria',
				role: 'admin'
			}, {
				strict: true
			});

			expect(imported_document.data).toEqual({
				name: 'maria'
			});
		});

		test('silently drops invalid base fields while preserving payload data', function () {
			const user_model = create_model(new Schema({
				id: {type: 'UUIDv7'},
				name: String
			}));

			const imported_document = user_model.from({
				id: 'not-a-uuid',
				name: 'maria',
				created_at: 'not-a-date'
			});

			expect(imported_document.data).toEqual({
				name: 'maria'
			});
			expect(imported_document.id).toBeUndefined();
			expect(imported_document.created_at).toBeUndefined();
		});

		test('returns a new empty document for non-object input', function () {
			const user_model = create_model(new Schema({
				name: String
			}));

			const imported_document = user_model.from(null);

			expect(imported_document).toBeInstanceOf(user_model);
			expect(imported_document.data).toEqual({});
			expect(imported_document.is_new).toBe(true);
		});
	});

	describe('hydrate', function () {
		test('builds a persisted document from row-like data with no modified paths', function () {
			const user_model = create_model(new Schema({
				name: {type: String, set: function (value) {return value.trim();}},
				age: Number
			}));

			const hydrated_document = user_model.hydrate({
				id: 7,
				data: {
					name: '  maria  ',
					age: '29'
				},
				created_at: '2026-03-03T08:00:00.000Z',
				updated_at: new Date('2026-03-03T09:00:00.000Z')
			});

			expect(hydrated_document).toBeInstanceOf(user_model);
			expect(hydrated_document.is_new).toBe(false);
			expect(hydrated_document.data).toEqual({
				name: 'maria',
				age: 29
			});
			expect(hydrated_document.id).toBe('7');
			expect(hydrated_document.created_at).toBe('2026-03-03T08:00:00.000Z');
			expect(hydrated_document.updated_at).toBe('2026-03-03T09:00:00.000Z');
			expect(hydrated_document.is_modified()).toBe(false);
		});

		test('builds a persisted document from plain source data and drops invalid base fields', function () {
			const user_model = create_model(new Schema({
				id: {type: 'UUIDv7'},
				name: String
			}));

			const hydrated_document = user_model.hydrate({
				id: 'not-a-uuid',
				name: 'maria',
				created_at: 'not-a-date'
			});

			expect(hydrated_document.is_new).toBe(false);
			expect(hydrated_document.data).toEqual({
				name: 'maria'
			});
			expect(hydrated_document.id).toBeUndefined();
			expect(hydrated_document.created_at).toBeUndefined();
			expect(hydrated_document.is_modified()).toBe(false);
		});
	});
});

function create_connection(options = {}, server_capabilities = null) {
	return {
		options: Object.assign({id_strategy: 'bigserial', auto_index: false}, options),
		server_capabilities
	};
}

function create_model(schema_instance, model_options = {}, connection = undefined, model_name = undefined) {
	return model(
		schema_instance,
		Object.assign({table_name: 'users'}, model_options),
		connection,
		model_name
	);
}

function build_schema_stub(overrides = {}) {
	const {
		indexes = [],
		paths = undefined,
		path = function () {
			return undefined;
		}
	} = overrides;

	return {
		validate: function (input_payload) {
			return input_payload;
		},
		get_indexes: function () {
			return indexes;
		},
		paths,
		path
	};
}

