import {describe, expect, test} from '@jest/globals';

import {create_parameter_state} from '#src/sql/parameter-binder.js';
import {JsonbOps} from '#src/sql/jsonb/ops.js';

describe('JsonbOps lifecycle', function () {
	test('rejects invalid definitions and malformed operator payloads', function () {
		expect(function parse_missing_object() {
			JsonbOps.from(null, {column_name: '"data"'});
		}).toThrow('JsonbOps requires an object definition');

		expect(function parse_missing_column_name() {
			JsonbOps.from({}, {});
		}).toThrow('JsonbOps requires options.column_name');

		expect(function parse_unsupported_operator() {
			JsonbOps.from({
				$insert: {
					name: 'alice'
				}
			}, {
				column_name: '"data"'
			});
		}).toThrow('Unsupported JSONB operator: $insert');

		expect(function parse_invalid_unset() {
			JsonbOps.from({
				$unset: 'name'
			}, {
				column_name: '"data"'
			});
		}).toThrow('$unset expects array');

		expect(function parse_invalid_set() {
			JsonbOps.from({
				$set: 'alice'
			}, {
				column_name: '"data"'
			});
		}).toThrow('$set expects plain object');
	});

	test('compiles replace-roots, unsets, and sets in canonical order', function () {
		const jsonb_ops = JsonbOps.from({
			$replace_roots: {
				fresh: true
			},
			$unset: ['legacy'],
			theme: 'dark'
		}, {
			column_name: '"data"',
			coalesce: false
		});
		const parameter_state = create_parameter_state();
		const expression = jsonb_ops.compile(parameter_state);

		expect(jsonb_ops.target).toBe('"data"');
		expect(jsonb_ops.operations).toEqual([
			{
				op: '$replace_roots',
				value: '{"fresh":true}'
			},
			{
				op: '#-',
				path: '{"legacy"}'
			},
			{
				op: 'jsonb_set',
				path: '{"theme"}',
				value: '"dark"'
			}
		]);
		expect(expression).toBe(`jsonb_set($1::jsonb #- '{"legacy"}', '{"theme"}', $2::jsonb, true)`);
		expect(parameter_state.params).toEqual([
			'{"fresh":true}',
			'"dark"'
		]);
	});

	test('defaults to coalesce and enforces the complexity limit', function () {
		const jsonb_ops = JsonbOps.from({
			active: true
		}, {
			column_name: '"payload"'
		});
		const oversized_definition = {};

		for(let key_index = 0; key_index < 1025; key_index += 1) {
			oversized_definition['key_' + key_index] = key_index;
		}

		expect(jsonb_ops.target).toBe(`COALESCE("payload", '{}'::jsonb)`);
		expect(function parse_oversized_definition() {
			JsonbOps.from(oversized_definition, {
				column_name: '"payload"'
			});
		}).toThrow('JSONB mutation exceeds complexity limit (1024)');
	});
});
