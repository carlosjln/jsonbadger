import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const ensure_table_mock = jest.fn();
const sql_runner_mock = jest.fn();

jest.unstable_mockModule('#src/migration/ensure-table.js', function () {
	return {
		default: ensure_table_mock
	};
});

jest.unstable_mockModule('#src/sql/sql-runner.js', function () {
	return {
		default: sql_runner_mock
	};
});

const {default: Schema} = await import('#src/schema/schema.js');
const {default: model} = await import('#src/model/factory/index.js');

describe('Document runtime behaviors', function () {
	beforeEach(function () {
		ensure_table_mock.mockReset();
		sql_runner_mock.mockReset();

		sql_runner_mock.mockResolvedValue({
			rows: [{
				id: '21',
				data: {name: 'saved'},
				created_at: new Date('2026-03-06T10:00:00.000Z'),
				updated_at: new Date('2026-03-06T11:00:00.000Z')
			}]
		});
	});

	describe('construction and runtime initialization', function () {
		test('runtime-ready init pulls base fields out of constructor payload', function () {
			const User = model(new Schema({name: String}), {
				table_name: 'users'
			});
			const user_document = new User({
				id: '9',
				name: 'john',
				created_at: '2026-03-03T08:00:00.000Z',
				updated_at: '2026-03-03T09:00:00.000Z'
			});

			expect(user_document.is_new).toBeUndefined();

			expect(user_document.is_modified()).toBe(false);
			expect(user_document.is_new).toBe(true);
			expect(user_document.id).toBe('9');
			expect(user_document.created_at).toBe('2026-03-03T08:00:00.000Z');
			expect(user_document.updated_at).toBe('2026-03-03T09:00:00.000Z');
			expect(user_document.data).toEqual({name: 'john'});
		});
	});

	describe('data access and mutation', function () {
		test('get resolves aliases and applies getters by default', function () {
			const schema_instance = new Schema({
				user_name: {
					type: String,
					alias: 'userName',
					get: function (value) {return value.toUpperCase();}
				}
			});
			const User = model(schema_instance, {
				table_name: 'users'
			});
			const user_document = new User({user_name: 'john'});

			expect(user_document.get('user_name')).toBe('JOHN');
			expect(user_document.get('userName')).toBe('JOHN');
			expect(user_document.get('userName', {getters: false})).toBe('john');
		});

		test('set resolves aliases, applies setter/cast, and creates nested objects', function () {
			const schema_instance = new Schema({
				count: Number,
				profile: {
					city: {
						type: String,
						alias: 'cityName',
						set: function (value) {return String(value).trim();}
					}
				}
			});
			const User = model(schema_instance, {
				table_name: 'users'
			});
			const user_document = new User({});

			const result = user_document
				.set('count', '41')
				.set('cityName', '  Miami  ');

			expect(result).toBe(user_document);
			expect(user_document.data).toEqual({
				count: 41,
				profile: {city: 'Miami'}
			});
		});

		test('alias virtual property proxies to get/set methods', function () {
			const schema_instance = new Schema({
				user_name: {
					type: String,
					alias: 'userName',
					set: function (value) {return String(value).trim();},
					get: function (value) {return value.toUpperCase();}
				}
			});
			const User = model(schema_instance, {
				table_name: 'users'
			});
			const user_document = new User({user_name: 'john'});

			expect(user_document.userName).toBe('JOHN');
			user_document.userName = '  jane  ';
			expect(user_document.data.user_name).toBe('jane');
			expect(user_document.userName).toBe('JANE');
		});

		test('mark_modified tracks paths and set auto-marks dirty paths', function () {
			const schema_instance = new Schema({
				profile: {
					city: String
				},
				runtime_date: {
					type: Date,
					alias: 'runtimeDate'
				}
			});

			const User = model(schema_instance, {
				table_name: 'users'
			});

			const user_document = new User({});

			expect(user_document.is_modified()).toBe(false);

			user_document.set('profile.city', 'Miami');
			user_document.mark_modified('runtimeDate');

			expect(user_document.is_modified()).toBe(true);
			expect(user_document.is_modified('profile.city')).toBe(true);
			expect(user_document.is_modified('profile')).toBe(true);
			expect(user_document.is_modified('runtime_date')).toBe(true);
			expect(user_document.is_modified('runtimeDate')).toBe(true);

			const cleared_result = user_document.clear_modified();

			expect(cleared_result).toBe(user_document);
			expect(user_document.is_modified()).toBe(false);
		});

		test('immutable field blocks changes after first persist and allows no-op assignment', function () {
			const schema_instance = new Schema({
				sku: {
					type: String,
					immutable: true
				}
			});

			const Product = model(schema_instance, {
				table_name: 'products'
			});

			const product_document = new Product({});

			product_document.set('sku', 'ABC-1');
			expect(product_document.data.sku).toBe('ABC-1');

			product_document.is_new = false;
			product_document.clear_modified();

			expect(function () {
				product_document.set('sku', 'ABC-1');
			}).not.toThrow();
			expect(product_document.is_modified()).toBe(false);

			expect(function () {
				product_document.set('sku', 'ABC-2');
			}).toThrow('immutable');
			expect(product_document.data.sku).toBe('ABC-1');
		});

		test('base-field access enforces read-only id and top-level-only timestamp mutations', function () {
			const User = model(new Schema({name: String}), {
				table_name: 'users'
			});
			const user_document = new User({
				id: '9',
				created_at: '2026-03-03T08:00:00.000Z'
			});

			expect(user_document.get('id')).toBe('9');
			expect(user_document.get('created_at')).toBe('2026-03-03T08:00:00.000Z');

			expect(function () {
				user_document.set('id', '10');
			}).toThrow('Read-only base field cannot be assigned by path mutation');

			expect(function () {
				user_document.mark_modified('id');
			}).toThrow('Read-only base field cannot be assigned by path mutation');

			expect(function () {
				user_document.set('created_at.value', '2026-03-04T00:00:00.000Z');
			}).toThrow('Timestamp fields only support top-level paths');

			expect(function () {
				user_document.mark_modified('updated_at');
			}).toThrow('Timestamp fields cannot be marked dirty by path');
		});

		test('timestamp base fields support top-level set and property assignment', function () {
			const User = model(new Schema({name: String}), {
				table_name: 'users'
			});
			const user_document = new User({name: 'john'});

			user_document.set('created_at', new Date('2026-03-04T00:00:00.000Z'));
			user_document.updated_at = '2026-03-05T00:00:00.000Z';

			expect(user_document.created_at).toBeInstanceOf(Date);
			expect(user_document.created_at.toISOString()).toBe('2026-03-04T00:00:00.000Z');
			expect(user_document.updated_at).toBe('2026-03-05T00:00:00.000Z');
		});
	});

	describe('persistence and hydration', function () {
		test('save transitions a new document into persisted state and clears dirty paths', async function () {
			const User = model(new Schema({name: String}), {
				table_name: 'users'
			});
			const user_document = new User({name: 'john'});

			user_document.set('name', 'saved');
			expect(user_document.is_modified('name')).toBe(true);

			const saved_document = await user_document.save();

			expect(saved_document).toBe(user_document);
			expect(user_document.is_new).toBe(false);
			expect(user_document.is_modified()).toBe(false);
			expect(user_document.to_json()).toEqual({
				name: 'saved',
				id: '21',
				created_at: '2026-03-06T10:00:00.000Z',
				updated_at: '2026-03-06T11:00:00.000Z'
			});
		});

		test('create_document_from_row returns a hydrated persisted document instance', function () {
			const User = model(new Schema({name: String}), {
				table_name: 'users'
			});

			const user_document = User.create_document_from_row({
				id: 31,
				data: {
					name: 'row-user',
					id: 'ignore-me'
				},
				created_at: new Date('2026-03-06T12:00:00.000Z'),
				updated_at: new Date('2026-03-06T13:00:00.000Z')
			});

			expect(user_document).toBeInstanceOf(User);
			expect(user_document.is_new).toBe(false);
			expect(user_document.data).toEqual({name: 'row-user'});
			expect(user_document.id).toBe('31');
			expect(user_document.created_at).toBe('2026-03-06T12:00:00.000Z');
			expect(user_document.updated_at).toBe('2026-03-06T13:00:00.000Z');
		});

		test('apply_document_row hydrates onto an existing doc and strips invalid row payloads', function () {
			const User = model(new Schema({name: String}), {
				table_name: 'users'
			});
			const user_document = new User({name: 'local'});

			const applied_document = User.apply_document_row(user_document, {
				id: 99n,
				data: 'not-an-object',
				created_at: 'not-a-date',
				updated_at: new Date('2026-03-06T13:00:00.000Z')
			});

			expect(applied_document).toBe(user_document);
			expect(user_document.is_new).toBe(false);
			expect(user_document.data).toEqual({});
			expect(user_document.id).toBe('99');
			expect(user_document.created_at).toBe('not-a-date');
			expect(user_document.updated_at).toBe('2026-03-06T13:00:00.000Z');
		});

		test('save on persisted documents rejects missing ids and skips no-op updates', async function () {
			const User = model(new Schema({name: String}), {
				table_name: 'users'
			});
			const missing_id_document = new User({name: 'john'});
			const unchanged_document = User.create_document_from_row({
				id: 31,
				data: {name: 'row-user'},
				created_at: new Date('2026-03-06T12:00:00.000Z'),
				updated_at: new Date('2026-03-06T13:00:00.000Z')
			});
			const update_one_mock = jest.fn();

			missing_id_document.is_new = false;
			User.update_one = update_one_mock;

			await expect(missing_id_document.save()).rejects.toThrow('Document id is required for save update operations');

			const save_result = await unchanged_document.save();

			expect(save_result).toBe(unchanged_document);
			expect(update_one_mock).not.toHaveBeenCalled();
		});

		test('save on persisted documents forwards modified payload and assigned timestamp base fields', async function () {
			const User = model(new Schema({name: String}), {
				table_name: 'users'
			});
			const update_one_mock = jest.fn()
				.mockResolvedValueOnce(null)
				.mockResolvedValueOnce({
					id: '31',
					data: {name: 'server-name'},
					created_at: '2026-03-10T00:00:00.000Z',
					updated_at: '2026-03-11T00:00:00.000Z'
				});

			User.update_one = update_one_mock;

			const no_match_document = User.create_document_from_row({
				id: 31,
				data: {name: 'row-user'},
				created_at: new Date('2026-03-06T12:00:00.000Z'),
				updated_at: new Date('2026-03-06T13:00:00.000Z')
			});

			no_match_document.set('name', 'draft-name');
			no_match_document.created_at = '2026-03-08T00:00:00.000Z';
			no_match_document.updated_at = '2026-03-09T00:00:00.000Z';

			const no_match_result = await no_match_document.save();

			expect(no_match_result).toBe(no_match_document);
			expect(update_one_mock).toHaveBeenNthCalledWith(1, {id: '31'}, {
				$set: {
					name: 'draft-name',
					created_at: '2026-03-08T00:00:00.000Z',
					updated_at: '2026-03-09T00:00:00.000Z'
				}
			});
			expect(no_match_document.data).toEqual({name: 'draft-name'});
			expect(no_match_document.created_at).toBe('2026-03-08T00:00:00.000Z');
			expect(no_match_document.updated_at).toBe('2026-03-09T00:00:00.000Z');

			const updated_document = User.create_document_from_row({
				id: 31,
				data: {name: 'row-user'},
				created_at: new Date('2026-03-06T12:00:00.000Z'),
				updated_at: new Date('2026-03-06T13:00:00.000Z')
			});

			updated_document.set('name', 'client-name');

			const save_result = await updated_document.save();

			expect(save_result).toBe(updated_document);
			expect(update_one_mock).toHaveBeenNthCalledWith(2, {id: '31'}, {
				$set: {
					name: 'client-name'
				}
			});
			expect(updated_document.is_new).toBe(false);
			expect(updated_document.data).toEqual({name: 'server-name'});
			expect(updated_document.created_at).toBe('2026-03-10T00:00:00.000Z');
			expect(updated_document.updated_at).toBe('2026-03-11T00:00:00.000Z');
			expect(updated_document.is_modified()).toBe(false);
		});
	});

	describe('serialization', function () {
		test('$serialize applies field getters by default without mutating document data', function () {
			const schema_instance = new Schema({
				name: {type: String, get: function (value) {return value.toUpperCase();}},
				address: {
					city: {type: String, get: function (value) {return value + '!';}}
				}
			});
			const User = model(schema_instance, {
				table_name: 'users'
			});
			const user_document = new User({
				name: 'john',
				address: {city: 'miami'}
			});

			const serialized = user_document.$serialize();

			expect(serialized).toEqual({
				name: 'JOHN',
				address: {city: 'miami!'}
			});
			expect(user_document.data).toEqual({
				name: 'john',
				address: {city: 'miami'}
			});
		});

		test('$serialize can bypass getters with getters=false', function () {
			const schema_instance = new Schema({
				name: {type: String, get: function (value) {return value.toUpperCase();}}
			});
			const User = model(schema_instance, {
				table_name: 'users'
			});
			const user_document = new User({name: 'john'});

			const serialized = user_document.$serialize({
				getters: false
			});

			expect(serialized).toEqual({name: 'john'});
		});

		test('to_json delegates to $serialize and JSON.stringify uses toJSON', function () {
			const User = model(new Schema({name: String}), {
				table_name: 'users'
			});
			const user_document = new User({name: 'john'});
			const serialize_spy = jest.fn().mockReturnValue({name: 'john', kind: 'user'});

			user_document.$serialize = serialize_spy;

			expect(user_document.to_json({getters: false})).toEqual({name: 'john', kind: 'user'});
			expect(serialize_spy).toHaveBeenCalledWith({getters: false});
			expect(JSON.parse(JSON.stringify(user_document))).toEqual({name: 'john', kind: 'user'});
		});

		test('to_json applies schema serialize transform', function () {
			const schema_instance = new Schema({
				name: {type: String, get: function (value) {return value.toUpperCase();}}
			}, {
				serialize: {
					transform: function (doc, ret) {
						ret.kind = 'user';
						return ret;
					}
				}
			});
			const User = model(schema_instance, {
				table_name: 'users'
			});
			const user_document = new User({name: 'john'});

			expect(user_document.to_json()).toEqual({
				name: 'JOHN',
				kind: 'user'
			});
		});

		test('call-level transform can override schema transform and disable transform', function () {
			const schema_instance = new Schema({
				name: String
			}, {
				serialize: {
					transform: function (doc, ret) {
						ret.kind = 'schema';
						return ret;
					}
				}
			});
			const User = model(schema_instance, {
				table_name: 'users'
			});
			const user_document = new User({name: 'john'});

			expect(user_document.to_json({
				transform: function (doc, ret) {
					ret.kind = 'call';
					return ret;
				}
			})).toEqual({name: 'john', kind: 'call'});

			expect(user_document.to_json({transform: false})).toEqual({name: 'john'});
		});
	});

	describe('schema methods', function () {
		test('Schema.method installs custom instance methods and custom serialization wrappers can call $serialize', function () {
			const schema_instance = new Schema({
				name: {type: String, get: function (value) {return value.toUpperCase();}}
			}, {
				serialize: {
					transform: function (doc, ret) {
						ret.kind = 'schema';
						return ret;
					}
				}
			});

			schema_instance.method('serialize_without_transform', function () {
				return this.$serialize({transform: false});
			});

			const User = model(schema_instance, {
				table_name: 'users'
			});
			const user_document = new User({name: 'john'});

			expect(user_document.serialize_without_transform()).toEqual({name: 'JOHN'});
			expect(user_document.to_json()).toEqual({name: 'JOHN', kind: 'schema'});
		});

		test('Schema.method rejects duplicate method registration', function () {
			const schema_instance = new Schema({name: String});

			schema_instance.method('summary', function () {
				return this.$serialize();
			});

			expect(function () {
				schema_instance.method('summary', function () {
					return this.$serialize();
				});
			}).toThrow('already exists');
		});

		test('Schema.method rejects conflicts with existing document properties', function () {
			const schema_instance = new Schema({name: String});

			schema_instance.method('save', function () {
				return this.$serialize();
			});

			expect(function () {
				model(schema_instance, {
					table_name: 'users'
				});
			}).toThrow('conflicts with an existing document property');
		});
	});
});
