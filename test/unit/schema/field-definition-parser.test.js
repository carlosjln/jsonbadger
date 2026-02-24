import {describe, expect, test} from '@jest/globals';

import field_definition_parser from '#src/schema/field-definition-parser.js';

describe('field_definition_parser', function () {
	test('parses foundational field types from implicit and explicit definitions', function () {
		const parsed_schema = field_definition_parser({
			title: String,
			age: {type: Number, min: 18},
			tags: [String],
			handles: {type: Map, of: String},
			payload: {}
		});

		expect(parsed_schema.field_types.title.instance).toBe('String');
		expect(parsed_schema.field_types.age.instance).toBe('Number');
		expect(parsed_schema.field_types.tags.instance).toBe('Array');
		expect(parsed_schema.field_types.tags.of_field_type.instance).toBe('String');
		expect(parsed_schema.field_types.handles.instance).toBe('Map');
		expect(parsed_schema.field_types.handles.of_field_type.instance).toBe('String');
		expect(parsed_schema.field_types.payload.instance).toBe('Mixed');
	});

	test('parses nested object paths when a field is not an explicit type declaration', function () {
		const parsed_schema = field_definition_parser({
			profile: {
				nickname: String
			}
		});

		expect(parsed_schema.object_paths.has('profile')).toBe(true);
		expect(parsed_schema.field_types['profile.nickname'].instance).toBe('String');
	});
});
