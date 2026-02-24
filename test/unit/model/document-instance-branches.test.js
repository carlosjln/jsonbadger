import {describe, expect, test} from '@jest/globals';

const {default: Schema} = await import('#src/schema/schema.js');
const {default: model} = await import('#src/model/model-factory.js');

describe('document-instance branch behavior', function () {
	test('get returns undefined for missing paths and returns raw values when no getter exists', function () {
		const schema_instance = new Schema({
			name: String
		});
		const User = model(schema_instance, {table_name: 'users'});
		const doc = new User({name: 'john'});

		expect(doc.get('missing')).toBeUndefined();
		expect(doc.get('name')).toBe('john');
	});

	test('set supports runtime option object, repairs non-object roots, and replaces invalid nested containers', function () {
		const schema_instance = new Schema({
			count: Number,
			profile: {
				city: String,
				state: String
			}
		});

		const User = model(schema_instance, {table_name: 'users'});
		const primitive_root_doc = new User('not-an-object');
		const nested_repair_doc = new User({profile: 'invalid'});
		const preserve_object_doc = new User({profile: {state: 'FL'}});

		primitive_root_doc.set('count', '41', {setters: true, cast: true});
		nested_repair_doc.set('profile.city', 'Miami');
		preserve_object_doc.set('profile.city', 'Miami');

		expect(primitive_root_doc.data).toEqual({count: 41});
		expect(nested_repair_doc.data).toEqual({profile: {city: 'Miami'}});
		expect(preserve_object_doc.data).toEqual({profile: {state: 'FL', city: 'Miami'}});
	});

	test('to_object returns original value when transform returns undefined', function () {
		const schema_instance = new Schema(
			{
				name: {type: String, get: function (value) {return value.toUpperCase();}}
			},
			{
				to_object: {
					transform: function () {
						return undefined;
					}
				}
			}
		);

		const User = model(schema_instance, {table_name: 'users'});
		const doc = new User({name: 'john'});

		expect(doc.to_object()).toEqual({name: 'JOHN'});
	});

	test('to_object uses schema to_object.getters option when call option is omitted', function () {
		const schema_instance = new Schema(
			{
				name: {type: String, get: function (value) {return value.toUpperCase();}}
			},
			{
				to_object: {
					getters: false
				}
			}
		);
		const User = model(schema_instance, {table_name: 'users'});
		const doc = new User({name: 'john'});

		expect(doc.to_object()).toEqual({name: 'john'});
	});

	test('to_object handles schema stubs without options/path and with invalid schema_description paths', function () {
		const no_path_schema = {
			validate: function (payload) {return payload;}
		};

		const invalid_paths_schema = {
			validate: function (payload) {return payload;},
			options: {},
			schema_description: {paths: 'bad'},
			path: function () {
				return null;
			}
		};

		const NoPathModel = model(no_path_schema, {table_name: 'no_path_users'});
		const InvalidPathsModel = model(invalid_paths_schema, {table_name: 'invalid_paths_users'});
		const no_path_doc = new NoPathModel({name: 'john'});
		const invalid_paths_doc = new InvalidPathsModel({name: 'john'});

		expect(no_path_doc.get('name')).toBe('john');
		expect(no_path_doc.set('name', 'jane')).toBe(no_path_doc);
		expect(no_path_doc.data).toEqual({name: 'jane'});
		expect(no_path_doc.to_object()).toEqual({name: 'jane'});
		expect(invalid_paths_doc.to_object()).toEqual({name: 'john'});
	});

	test('to_object skips getters when serialized value is not an object or getter path is missing', function () {
		const schema_instance = new Schema({
			name: {type: String, get: function (value) {return value.toUpperCase();}},
			profile: {
				city: {type: String, get: function (value) {return value + '!';}}
			}
		});

		const User = model(schema_instance, {table_name: 'users'});
		const primitive_doc = new User('hello');
		const missing_nested_doc = new User({name: 'john'});

		expect(primitive_doc.to_object()).toBe('hello');
		expect(missing_nested_doc.to_object()).toEqual({name: 'JOHN'});
	});

	test('getter application sorts same-depth paths deterministically', function () {
		const getter_order = [];
		const schema_instance = new Schema({
			z_name: {type: String, get: function (value) {getter_order.push('z_name'); return value;}},
			a_name: {type: String, get: function (value) {getter_order.push('a_name'); return value;}}
		});

		const User = model(schema_instance, {table_name: 'users'});
		const doc = new User({z_name: 'z', a_name: 'a'});

		doc.to_object();

		expect(getter_order).toEqual(['a_name', 'z_name']);
	});

	test('model creation rejects duplicate aliases and alias property conflicts, and skips dotted alias properties', function () {
		const duplicate_alias_schema = new Schema({
			first_name: {type: String, alias: 'nameAlias'},
			last_name: {type: String, alias: 'nameAlias'}
		});

		expect(function () {
			model(duplicate_alias_schema, {table_name: 'dupe_alias_users'});
		}).toThrow('Duplicate alias');

		const conflict_alias_schema = new Schema({
			status: {type: String, alias: 'get'}
		});

		expect(function () {
			model(conflict_alias_schema, {table_name: 'conflict_alias_users'});
		}).toThrow('conflicts with an existing document property');

		const dotted_alias_schema = new Schema({
			profile: {
				city: {type: String, alias: 'profile.city_alias'}
			}
		});

		const DottedAliasUser = model(dotted_alias_schema, {table_name: 'dotted_alias_users'});
		const doc = new DottedAliasUser({profile: {city: 'Miami'}});

		expect(Object.prototype.hasOwnProperty.call(DottedAliasUser.prototype, 'profile.city_alias')).toBe(false);
		expect(doc.get('profile.city_alias')).toBe('Miami');
	});

	test('model creation tolerates schema.path entries without options when building alias map', function () {
		const schema_stub = {
			validate: function (payload) {return payload;},
			schema_description: {paths: ['name']},
			path: function () {
				return {};
			}
		};

		expect(function () {
			model(schema_stub, {table_name: 'no_alias_options_users'});
		}).not.toThrow();
	});

	test('immutable fields also block assignment when missing on persisted documents', function () {
		const schema_instance = new Schema({
			sku: {type: String, immutable: true}
		});
		const Product = model(schema_instance, {table_name: 'products'});
		const doc = new Product({});

		doc.is_new = false;

		expect(function () {
			doc.set('sku', 'ABC-1');
		}).toThrow('immutable');
	});

	test('is_modified returns false for unrelated paths', function () {
		const schema_instance = new Schema({
			profile: {city: String},
			updated_at: Date
		});

		const User = model(schema_instance, {table_name: 'users'});
		const doc = new User({});

		doc.mark_modified('profile.city');

		expect(doc.is_modified('updated_at')).toBe(false);
	});
});

