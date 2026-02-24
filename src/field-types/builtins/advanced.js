import BaseFieldType from '#src/field-types/base-field-type.js';

const INT32_MIN = -2147483648;
const INT32_MAX = 2147483647;
const decimal_string_pattern = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

function decimal128_type_reference() {
	return;
}

function double_type_reference() {
	return;
}

function int32_type_reference() {
	return;
}

function union_type_reference() {
	return;
}

function Decimal128FieldType(path_value, options) {
	BaseFieldType.call(this, path_value, options);
	this.instance = 'Decimal128';
}

Decimal128FieldType.prototype = Object.create(BaseFieldType.prototype);
Decimal128FieldType.prototype.constructor = Decimal128FieldType;

Decimal128FieldType.prototype.cast = function (value) {
	if(value === undefined || value === null) {
		return value;
	}

	if(typeof value === 'bigint') {
		return value.toString();
	}

	if(typeof value === 'number') {
		if(!Number.isFinite(value)) {
			throw this.create_field_error('cast_error', 'Cast to Decimal128 failed for path "' + this.path + '"', value);
		}

		return String(value);
	}

	if(typeof value === 'string') {
		const normalized_value = value.trim();

		if(!decimal_string_pattern.test(normalized_value)) {
			throw this.create_field_error('cast_error', 'Cast to Decimal128 failed for path "' + this.path + '"', value);
		}

		return normalized_value;
	}

	if(value && typeof value.valueOf === 'function') {
		const value_of_result = value.valueOf();

		if(value_of_result !== value) {
			return this.cast(value_of_result);
		}
	}

	throw this.create_field_error('cast_error', 'Cast to Decimal128 failed for path "' + this.path + '"', value);
};

function BigIntFieldType(path_value, options) {
	BaseFieldType.call(this, path_value, options);
	this.instance = 'BigInt';
}

BigIntFieldType.prototype = Object.create(BaseFieldType.prototype);
BigIntFieldType.prototype.constructor = BigIntFieldType;

BigIntFieldType.prototype.cast = function (value) {
	if(value === undefined || value === null) {
		return value;
	}

	if(typeof value === 'bigint') {
		return value;
	}

	if(value === true) {
		return 1n;
	}

	if(value === false) {
		return 0n;
	}

	if(typeof value === 'number') {
		if(!Number.isFinite(value) || !Number.isInteger(value)) {
			throw this.create_field_error('cast_error', 'Cast to BigInt failed for path "' + this.path + '"', value);
		}

		return BigInt(value);
	}

	if(typeof value === 'string') {
		const normalized_value = value.trim();

		if(!/^[+-]?\d+$/.test(normalized_value)) {
			throw this.create_field_error('cast_error', 'Cast to BigInt failed for path "' + this.path + '"', value);
		}

		try {
			return BigInt(normalized_value);
		} catch(error) {
			throw this.create_field_error('cast_error', 'Cast to BigInt failed for path "' + this.path + '"', value);
		}
	}

	if(value && typeof value.valueOf === 'function') {
		const value_of_result = value.valueOf();

		if(value_of_result !== value) {
			return this.cast(value_of_result);
		}
	}

	throw this.create_field_error('cast_error', 'Cast to BigInt failed for path "' + this.path + '"', value);
};

function DoubleFieldType(path_value, options) {
	BaseFieldType.call(this, path_value, options);
	this.instance = 'Double';
}

DoubleFieldType.prototype = Object.create(BaseFieldType.prototype);
DoubleFieldType.prototype.constructor = DoubleFieldType;

DoubleFieldType.prototype.cast = function (value) {
	if(value === undefined || value === null) {
		return value;
	}

	if(value === true) {
		return 1;
	}

	if(value === false) {
		return 0;
	}

	if(typeof value === 'number') {
		if(!Number.isFinite(value)) {
			throw this.create_field_error('cast_error', 'Cast to Double failed for path "' + this.path + '"', value);
		}

		return value;
	}

	if(typeof value === 'string') {
		if(value.trim() === '') {
			return null;
		}

		const string_number = Number(value);

		if(!Number.isFinite(string_number)) {
			throw this.create_field_error('cast_error', 'Cast to Double failed for path "' + this.path + '"', value);
		}

		return string_number;
	}

	if(value && typeof value.valueOf === 'function') {
		const value_of_result = value.valueOf();

		if(value_of_result !== value) {
			return this.cast(value_of_result);
		}
	}

	throw this.create_field_error('cast_error', 'Cast to Double failed for path "' + this.path + '"', value);
};

function Int32FieldType(path_value, options) {
	BaseFieldType.call(this, path_value, options);
	this.instance = 'Int32';
}

Int32FieldType.prototype = Object.create(BaseFieldType.prototype);
Int32FieldType.prototype.constructor = Int32FieldType;

Int32FieldType.prototype.cast = function (value) {
	if(value === undefined || value === null) {
		return value;
	}

	if(value === true) {
		return 1;
	}

	if(value === false) {
		return 0;
	}

	if(typeof value === 'string') {
		if(value.trim() === '') {
			return null;
		}

		const string_number = Number(value);
		return cast_int32(this, string_number, value);
	}

	if(typeof value === 'number') {
		return cast_int32(this, value, value);
	}

	if(value && typeof value.valueOf === 'function') {
		const value_of_result = value.valueOf();

		if(value_of_result !== value) {
			return this.cast(value_of_result);
		}
	}

	throw this.create_field_error('cast_error', 'Cast to Int32 failed for path "' + this.path + '"', value);
};

function UnionFieldType(path_value, options) {
	BaseFieldType.call(this, path_value, options);
	this.instance = 'Union';
	this.of_field_types = Array.isArray(options && options.of_field_types) ? options.of_field_types.slice() : [];
	this.validators.push({
		kind: 'union'
	});
}

UnionFieldType.prototype = Object.create(BaseFieldType.prototype);
UnionFieldType.prototype.constructor = UnionFieldType;

UnionFieldType.prototype.cast = function (value, context_value) {
	if(value === undefined || value === null) {
		return value;
	}

	if(this.of_field_types.length === 0) {
		throw this.create_field_error('cast_error', 'Union type at path "' + this.path + '" requires at least one candidate type', value);
	}

	const union_context = context_value || {};
	let candidate_index = 0;

	while(candidate_index < this.of_field_types.length) {
		const candidate_field_type = this.of_field_types[candidate_index];

		if(is_exact_union_match(candidate_field_type, value)) {
			candidate_field_type.validate(value, union_context);
			return value;
		}

		candidate_index += 1;
	}

	let last_error = null;
	candidate_index = 0;

	while(candidate_index < this.of_field_types.length) {
		const candidate_field_type = this.of_field_types[candidate_index];

		try {
			return normalize_union_candidate(candidate_field_type, value, union_context);
		} catch(error) {
			last_error = error;
			candidate_index += 1;
		}
	}

	throw last_error || this.create_field_error('cast_error', 'Cast to Union failed for path "' + this.path + '"', value);
};

function cast_int32(field_type, numeric_value, original_value) {
	if(!Number.isFinite(numeric_value) || !Number.isInteger(numeric_value)) {
		throw field_type.create_field_error('cast_error', 'Cast to Int32 failed for path "' + field_type.path + '"', original_value);
	}

	if(numeric_value < INT32_MIN || numeric_value > INT32_MAX) {
		throw field_type.create_field_error('cast_error', 'Cast to Int32 failed for path "' + field_type.path + '"', original_value);
	}

	return numeric_value;
}

function normalize_union_candidate(candidate_field_type, value, context_value) {
	let next_value = value;

	if(typeof candidate_field_type.apply_set === 'function') {
		next_value = candidate_field_type.apply_set(next_value, context_value);
	}

	next_value = candidate_field_type.cast(next_value, context_value);
	candidate_field_type.validate(next_value, context_value);
	return next_value;
}

function is_exact_union_match(candidate_field_type, value) {
	const instance_name = candidate_field_type.instance;

	if(instance_name === 'String') {
		return typeof value === 'string';
	}

	if(instance_name === 'Number' || instance_name === 'Double') {
		return typeof value === 'number' && Number.isFinite(value);
	}

	if(instance_name === 'Int32') {
		return typeof value === 'number' && Number.isInteger(value) && value >= INT32_MIN && value <= INT32_MAX;
	}

	if(instance_name === 'BigInt') {
		return typeof value === 'bigint';
	}

	if(instance_name === 'Boolean') {
		return typeof value === 'boolean';
	}

	if(instance_name === 'Date') {
		return value instanceof Date && !Number.isNaN(value.getTime());
	}

	if(instance_name === 'Buffer') {
		return Buffer.isBuffer(value);
	}

	if(instance_name === 'Array') {
		return Array.isArray(value);
	}

	if(instance_name === 'Map') {
		return value instanceof Map || (value !== null && typeof value === 'object' && !Array.isArray(value) && !Buffer.isBuffer(value) && !(value instanceof Date));
	}

	if(instance_name === 'Mixed') {
		return true;
	}

	return false;
}

export {
	// Type references
	decimal128_type_reference,
	double_type_reference,
	int32_type_reference,
	union_type_reference,

	// FieldType constructors
	BigIntFieldType,
	Decimal128FieldType,
	DoubleFieldType,
	Int32FieldType,
	UnionFieldType,

	// Constants
	INT32_MIN,
	INT32_MAX
};
