import {describe, expect, test} from '@jest/globals';

const {default: Schema} = await import('#src/schema/schema.js');
const {default: model} = await import('#src/model/model-factory.js');

describe('Document runtime behaviors (phase 3 foundation)', function () {
	test('to_object applies field getters by default without mutating document data', function () {
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

		const serialized = user_document.to_object();

		expect(serialized).toEqual({
			name: 'JOHN',
			address: {city: 'miami!'}
		});
		expect(user_document.data).toEqual({
			name: 'john',
			address: {city: 'miami'}
		});
	});

	test('to_object can bypass getters with getters=false', function () {
		const schema_instance = new Schema({
			name: {type: String, get: function (value) {return value.toUpperCase();}}
		});
		const User = model(schema_instance, {
			table_name: 'users'
		});
		const user_document = new User({name: 'john'});

		const serialized = user_document.to_object({
			getters: false
		});

		expect(serialized).toEqual({name: 'john'});
	});

	test('to_json applies schema transform and JSON.stringify uses toJSON', function () {
		const schema_instance = new Schema({
			name: {type: String, get: function (value) {return value.toUpperCase();}}
		}, {
			to_json: {
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
		expect(JSON.parse(JSON.stringify(user_document))).toEqual({
			name: 'JOHN',
			kind: 'user'
		});
	});

	test('call-level transform can override schema transform and disable transform', function () {
		const schema_instance = new Schema({
			name: String
		}, {
			to_json: {
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
			updated_at: {
				type: Date,
				alias: 'updatedAt'
			}
		});
		const User = model(schema_instance, {
			table_name: 'users'
		});
		const user_document = new User({});

		expect(user_document.is_modified()).toBe(false);

		user_document.set('profile.city', 'Miami');
		user_document.mark_modified('updatedAt');

		expect(user_document.is_modified()).toBe(true);
		expect(user_document.is_modified('profile.city')).toBe(true);
		expect(user_document.is_modified('profile')).toBe(true);
		expect(user_document.is_modified('updated_at')).toBe(true);
		expect(user_document.is_modified('updatedAt')).toBe(true);

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
});
