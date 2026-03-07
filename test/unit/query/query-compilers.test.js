import {describe, expect, test} from '@jest/globals';

import limit_skip_compiler from '#src/query/limit-skip-compiler.js';
import {build_elem_text_expression, build_json_expression, build_text_expression, parse_path} from '#src/query/path-parser.js';
import sort_compiler from '#src/query/sort-compiler.js';

describe('query compilers', function () {
	test('limit_skip_compiler builds limit and offset clauses and normalizes integers', function () {
		expect(limit_skip_compiler(10.9, '2.7')).toBe(' LIMIT 10 OFFSET 2');
		expect(limit_skip_compiler(3, null)).toBe(' LIMIT 3');
		expect(limit_skip_compiler(null, 4.2)).toBe(' OFFSET 4');
	});

	test('limit_skip_compiler ignores invalid and negative numeric values', function () {
		expect(limit_skip_compiler('not-a-number', undefined)).toBe('');
		expect(limit_skip_compiler(-1, -2)).toBe('');
		expect(limit_skip_compiler(NaN, NaN)).toBe('');
	});

	test('path parser builds text/json expressions for single and nested paths', function () {
		expect(build_text_expression('data', 'user_name')).toBe("data ->> 'user_name'");
		expect(build_text_expression('data', 'profile.city')).toBe("data #>> '{profile,city}'");
		expect(build_json_expression('data', 'payload')).toBe("data -> 'payload'");
		expect(build_json_expression('data', 'payload.items')).toBe("data #> '{payload,items}'");
		expect(build_elem_text_expression('elem', ['name'])).toBe("elem->>'name'");
		expect(build_elem_text_expression('elem', ['stats', 'score'])).toBe("elem #>> '{stats,score}'");
	});

	test('parse_path returns root/child path details and validates path input', function () {
		expect(parse_path('profile.city')).toEqual({
			path_segments: ['profile', 'city'],
			root_path: 'profile',
			child_segments: ['city'],
			is_nested: true
		});
		expect(parse_path('age')).toEqual({
			path_segments: ['age'],
			root_path: 'age',
			child_segments: [],
			is_nested: false
		});
		expect(function parse_invalid_path() {
			parse_path('');
		}).toThrow();
	});

	test('sort_compiler returns empty fragments for invalid or empty definitions', function () {
		expect(sort_compiler(null)).toBe('');
		expect(sort_compiler('name')).toBe('');
		expect(sort_compiler({})).toBe('');
	});

	test('sort_compiler builds ORDER BY clauses with default and custom data columns', function () {
		expect(sort_compiler({user_name: -1, age: 1})).toBe(
			" ORDER BY \"data\" ->> 'user_name' DESC, \"data\" ->> 'age' ASC"
		);
		expect(sort_compiler({city: 1}, {data_column: 'payload_json'})).toBe(
			" ORDER BY \"payload_json\" ->> 'city' ASC"
		);
	});

	test('sort_compiler maps base fields to table columns and rejects dotted base-field paths', function () {
		expect(sort_compiler({id: 1, created_at: -1, updated_at: 1})).toBe(
			' ORDER BY "id" ASC, "created_at" DESC, "updated_at" ASC'
		);

		expect(function compile_invalid_base_field_sort_path() {
			sort_compiler({'created_at.value': 1});
		}).toThrow('Base fields only support top-level sort paths');
	});
});
