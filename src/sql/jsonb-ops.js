import QueryError from '#src/errors/query-error.js';
import {bind_parameter} from '#src/sql/parameter-binder.js';
import {is_array} from '#src/utils/array.js';
import {build_path_literal, split_dot_path} from '#src/utils/object-path.js';
import {jsonb_stringify} from '#src/utils/json.js';
import {is_not_object, is_plain_object} from '#src/utils/value.js';

/**
 * The canonical execution order for PostgreSQL JSONB mutations.
 */
const core_update_operators = ['$replace_roots', '$unset', '$set'];

/**
 * Utility for parsing JSONB mutations into a flat, ordered operation list.
 * This acts as a Syntax Firewall: it knows HOW to write PG syntax, 
 * but knows NOTHING about SQL parameters.
 */
function JsonbOps(target, operations) {
	this.target = target;
	this.operations = operations;
}

/**
 * Compile one JsonbOps instance into a PostgreSQL JSONB RHS expression.
 *
 * @param {object} parameter_state
 * @returns {string}
 */
JsonbOps.prototype.compile = function (parameter_state) {
	let expression = this.target;

	for(const step of this.operations) {
		if(step.op === '$replace_roots') {
			const placeholder = bind_parameter(parameter_state, step.value);
			expression = `${placeholder}::jsonb`;
		}
		else if(step.op === '#-') {
			expression = `${expression} #- '${step.path}'`;
		}
		else if(step.op === 'jsonb_set') {
			const placeholder = bind_parameter(parameter_state, step.value);
			expression = `jsonb_set(${expression}, '${step.path}', ${placeholder}::jsonb, true)`;
		}
	}

	return expression;
};

/**
 * Transforms one operator-style update definition into a JsonbOps instance.
 *
 * The input contract here is `$replace_roots`, `$unset`, `$set`, plus implicit
 * top-level `$set` keys. If the caller starts from a tracker delta shape
 * (`replace_roots`, `set`, `unset`), the orchestrator must map that delta into
 * operator-style keys before calling `.from(...)`.
 *
 * @param {object} update_definition - Operator-style update input for one JSONB mutation.
 * @param {object} options
 * @param {string} options.column_name - The target column (e.g. '"data"').
 * @param {boolean} [options.coalesce=true] - Wrap base in COALESCE.
 * @returns {JsonbOps}
 */
JsonbOps.from = function (update_definition, options) {
	if(is_not_object(update_definition)) {
		throw new QueryError('JsonbOps requires an object definition');
	}

	const {column_name, coalesce = true} = options || {};

	if(!column_name) {
		throw new QueryError('JsonbOps requires options.column_name');
	}

	// Initialized with explicit types to avoid defensive assignment later
	const buckets = {$replace_roots: {}, $unset: [], $set: {}};
	let total_operations = 0;

	// 1. Distribution & Auto-Wrapping
	for(const [key, value] of Object.entries(update_definition)) {
		if(key.startsWith('$')) {
			if(!core_update_operators.includes(key)) {
				throw new QueryError(`Unsupported JSONB operator: ${key}`);
			}

			if(key === '$unset') {
				if(!is_array(value)) {
					throw new QueryError('$unset expects array');
				}

				buckets.$unset.push(...value);
				total_operations += value.length;

			} else {
				if(!is_plain_object(value)) {
					throw new QueryError(`${key} expects plain object`);
				}

				Object.assign(buckets[key], value);
				total_operations += Object.keys(value).length;
			}

		} else {
			// Implicit wrapping of raw keys into $set
			buckets.$set[key] = value;
			total_operations += 1;
		}
	}

	if(total_operations > 1024) {
		throw new QueryError('JSONB mutation exceeds complexity limit (1024)');
	}

	// 2. Build the Linear Operation List
	const operations = [];
	let target = coalesce ? `COALESCE(${column_name}, '{}'::jsonb)` : column_name;

	// A. Replace Roots (Redefines the starting target)
	if(Object.keys(buckets.$replace_roots).length > 0) {
		operations.push({
			op: '$replace_roots',
			value: jsonb_stringify(buckets.$replace_roots)
		});
	}

	// B. Unsets
	if(buckets.$unset.length > 0) {
		for(const path of buckets.$unset) {
			operations.push({
				op: '#-',
				path: build_path_literal(split_dot_path(path))
			});
		}
	}

	// C. Sets
	if(Object.keys(buckets.$set).length > 0) {
		for(const [path, value] of Object.entries(buckets.$set)) {
			operations.push({
				op: 'jsonb_set',
				path: build_path_literal(split_dot_path(path)),
				value: jsonb_stringify(value)
			});
		}
	}

	return new JsonbOps(target, operations);
};

export {JsonbOps};
