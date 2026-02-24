import {describe, expect, test} from '@jest/globals';

import field_definition_parser from '#src/schema/field-definition-parser.js';

describe('field_definition_parser branch coverage', function () {
	test('throws for invalid root schema and invalid field definitions', function () {
		expect(function parse_invalid_root_array() {
			field_definition_parser([]);
		}).toThrow('Schema definition must be an object');

		expect(function parse_invalid_field_number() {
			field_definition_parser({bad: 123});
		}).toThrow('Invalid field definition at path "bad"');
	});

	test('supports explicit array type syntax and validates array arity', function () {
		const parsed_schema = field_definition_parser({
			tags: {type: [String]},
			queue: {type: Array}
		});

		expect(parsed_schema.field_types.tags.instance).toBe('Array');
		expect(parsed_schema.field_types.tags.of_field_type.instance).toBe('String');
		expect(parsed_schema.field_types.queue.instance).toBe('Array');
		expect(parsed_schema.field_types.queue.of_field_type.instance).toBe('Mixed');

		expect(function parse_invalid_array_arity() {
			field_definition_parser({broken: [String, Number]});
		}).toThrow('Array type definition at path "broken" must contain at most one item type');
	});

	test('throws when registry reports explicit type but cannot resolve a type name', function () {
		const registry_stub = {
			has_field_type: function (value) {
				return value === 'BogusType';
			},
			resolve_field_type_name: function () {
				return null;
			},
			create_field_type: function () {
				throw new Error('create_field_type should not be called');
			}
		};

		expect(function parse_unsupported_explicit_type() {
			field_definition_parser({value: {type: 'BogusType'}}, registry_stub);
		}).toThrow('Unsupported field type at path "value"');
	});

	test('parses union candidates across array, primitive, and explicit object definitions', function () {
		const parsed_schema = field_definition_parser({
			choice: {
				type: 'Union',
				of: [
					[String],
					Boolean,
					{type: Number, min: 1}
				]
			}
		});
		const union_field_type = parsed_schema.field_types.choice;

		expect(union_field_type.instance).toBe('Union');
		expect(union_field_type.of_field_types[0].instance).toBe('Array');
		expect(union_field_type.of_field_types[0].of_field_type.instance).toBe('String');
		expect(union_field_type.of_field_types[1].instance).toBe('Boolean');
		expect(union_field_type.of_field_types[2].instance).toBe('Number');
		expect(union_field_type.of_field_types[2].options.min).toBe(1);
	});

	test('validates union definitions and rejects unsupported union members', function () {
		expect(function parse_union_without_array() {
			field_definition_parser({choice: {type: 'Union', of: String}});
		}).toThrow('must define a non-empty "of" array');

		expect(function parse_union_with_empty_of() {
			field_definition_parser({choice: {type: 'Union', of: []}});
		}).toThrow('must define a non-empty "of" array');

		expect(function parse_union_with_unsupported_candidate() {
			field_definition_parser({choice: {type: 'Union', of: [{nested: String}]}});
		}).toThrow('Unsupported union type at path "choice"');
	});

	test('parses Map of definitions across undefined, array, explicit object, and plain object fallback', function () {
		const parsed_schema = field_definition_parser({
			map_any: {type: Map},
			map_of_arrays: {type: Map, of: [String]},
			map_numbers: {type: Map, of: {type: Number, min: 0}},
			map_mixed: {type: Map, of: {nested: String}}
		});

		expect(parsed_schema.field_types.map_any.of_field_type.instance).toBe('Mixed');
		expect(parsed_schema.field_types.map_of_arrays.of_field_type.instance).toBe('Array');
		expect(parsed_schema.field_types.map_of_arrays.of_field_type.of_field_type.instance).toBe('String');
		expect(parsed_schema.field_types.map_numbers.of_field_type.instance).toBe('Number');
		expect(parsed_schema.field_types.map_numbers.of_field_type.options.min).toBe(0);
		expect(parsed_schema.field_types.map_mixed.of_field_type.instance).toBe('Mixed');
	});

	test('rejects unsupported of definitions for collection types', function () {
		expect(function parse_unsupported_of_definition() {
			field_definition_parser({map_bad: {type: Map, of: 123}});
		}).toThrow('Unsupported "of" definition at path "map_bad"');
	});
});
