/*
Assumptions and trade-offs:
- Foundational FieldTypes focus on deterministic cast/validate behavior for save-path use.
- Advanced type families and deep collection sub-schema behavior are deferred to later phases.
*/
import BaseFieldType from '#src/field-types/base-field-type.js';
import {
	decimal128_type_reference,
	double_type_reference,
	BigIntFieldType,
	Decimal128FieldType,
	DoubleFieldType,
	int32_type_reference,
	Int32FieldType,
	union_type_reference,
	UnionFieldType
} from './advanced.js';

const uuidv7_pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const boolean_convert_to_true = new Set([true, 'true', 1, '1', 'yes']);
const boolean_convert_to_false = new Set([false, 'false', 0, '0', 'no']);

function uuidv7_type_reference() {
	return;
}

function StringFieldType(path_value, options) {
	BaseFieldType.call(this, path_value, options);
	this.instance = 'String';

	if(options && options.match instanceof RegExp) {
		this.regExp = options.match;
		this.validators.push({
			kind: 'match'
		});
	}

	if(options && Array.isArray(options.enum)) {
		this.enum_values = options.enum.slice();
		this.validators.push({
			kind: 'enum'
		});
	}

	if(options && options.minLength !== undefined) {
		this.validators.push({
			kind: 'minLength'
		});
	}

	if(options && options.maxLength !== undefined) {
		this.validators.push({
			kind: 'maxLength'
		});
	}
}

StringFieldType.prototype = Object.create(BaseFieldType.prototype);
StringFieldType.prototype.constructor = StringFieldType;

StringFieldType.prototype.cast = function (value) {
	if(value === undefined || value === null) {
		return value;
	}

	if(Array.isArray(value)) {
		throw this.create_field_error('cast_error', 'Cast to String failed for path "' + this.path + '"', value);
	}

	let casted_value = value;

	if(typeof casted_value !== 'string') {
		if(casted_value && typeof casted_value.toString === 'function' && casted_value.toString !== Object.prototype.toString) {
			casted_value = casted_value.toString();
		} else {
			throw this.create_field_error('cast_error', 'Cast to String failed for path "' + this.path + '"', value);
		}
	}

	if(this.options.trim === true) {
		casted_value = casted_value.trim();
	}

	if(this.options.lowercase === true) {
		casted_value = casted_value.toLowerCase();
	}

	if(this.options.uppercase === true) {
		casted_value = casted_value.toUpperCase();
	}

	return casted_value;
};

StringFieldType.prototype.run_type_validators = function (value) {
	if(this.regExp && !this.regExp.test(value)) {
		throw this.create_field_error('validator_error', 'Path "' + this.path + '" does not match pattern', value);
	}

	if(this.enum_values && this.enum_values.indexOf(value) === -1) {
		throw this.create_field_error('validator_error', 'Path "' + this.path + '" must be one of enum values', value);
	}

	if(this.options.minLength !== undefined && value.length < Number(this.options.minLength)) {
		throw this.create_field_error('validator_error', 'Path "' + this.path + '" is shorter than minLength', value);
	}

	if(this.options.maxLength !== undefined && value.length > Number(this.options.maxLength)) {
		throw this.create_field_error('validator_error', 'Path "' + this.path + '" is longer than maxLength', value);
	}
};

function NumberFieldType(path_value, options) {
	BaseFieldType.call(this, path_value, options);
	this.instance = 'Number';

	if(options && Array.isArray(options.enum)) {
		this.enum_values = options.enum.slice();
		this.validators.push({
			kind: 'enum'
		});
	}

	if(options && options.min !== undefined) {
		this.validators.push({
			kind: 'min'
		});
	}

	if(options && options.max !== undefined) {
		this.validators.push({
			kind: 'max'
		});
	}
}

NumberFieldType.prototype = Object.create(BaseFieldType.prototype);
NumberFieldType.prototype.constructor = NumberFieldType;

NumberFieldType.prototype.cast = function (value) {
	if(value === undefined || value === null) {
		return value;
	}

	if(Array.isArray(value)) {
		throw this.create_field_error('cast_error', 'Cast to Number failed for path "' + this.path + '"', value);
	}

	if(typeof value === 'number') {
		if(!Number.isFinite(value)) {
			throw this.create_field_error('cast_error', 'Cast to Number failed for path "' + this.path + '"', value);
		}

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
			throw this.create_field_error('cast_error', 'Cast to Number failed for path "' + this.path + '"', value);
		}

		const string_number = Number(value);

		if(!Number.isFinite(string_number)) {
			throw this.create_field_error('cast_error', 'Cast to Number failed for path "' + this.path + '"', value);
		}

		return string_number;
	}

	if(value && typeof value.valueOf === 'function') {
		const value_of_result = value.valueOf();

		if(typeof value_of_result === 'number' && Number.isFinite(value_of_result)) {
			return value_of_result;
		}
	}

	throw this.create_field_error('cast_error', 'Cast to Number failed for path "' + this.path + '"', value);
};

NumberFieldType.prototype.run_type_validators = function (value) {
	if(this.enum_values && this.enum_values.indexOf(value) === -1) {
		throw this.create_field_error('validator_error', 'Path "' + this.path + '" must be one of enum values', value);
	}

	if(this.options.min !== undefined && value < Number(this.options.min)) {
		throw this.create_field_error('validator_error', 'Path "' + this.path + '" is lower than min', value);
	}

	if(this.options.max !== undefined && value > Number(this.options.max)) {
		throw this.create_field_error('validator_error', 'Path "' + this.path + '" is greater than max', value);
	}
};

function DateFieldType(path_value, options) {
	BaseFieldType.call(this, path_value, options);
	this.instance = 'Date';

	if(options && options.min !== undefined) {
		this.validators.push({
			kind: 'min'
		});
	}

	if(options && options.max !== undefined) {
		this.validators.push({
			kind: 'max'
		});
	}
}

DateFieldType.prototype = Object.create(BaseFieldType.prototype);
DateFieldType.prototype.constructor = DateFieldType;

DateFieldType.prototype.cast = function (value) {
	if(value === undefined || value === null) {
		return value;
	}

	if(value instanceof Date) {
		if(Number.isNaN(value.getTime())) {
			throw this.create_field_error('cast_error', 'Cast to Date failed for path "' + this.path + '"', value);
		}

		return value;
	}

	const casted_date = new Date(value);

	if(Number.isNaN(casted_date.getTime())) {
		throw this.create_field_error('cast_error', 'Cast to Date failed for path "' + this.path + '"', value);
	}

	return casted_date;
};

DateFieldType.prototype.run_type_validators = function (value) {
	if(!(value instanceof Date)) {
		throw this.create_field_error('validator_error', 'Path "' + this.path + '" must be a Date', value);
	}

	if(this.options.min !== undefined) {
		const min_date = this.cast(this.options.min);

		if(value.getTime() < min_date.getTime()) {
			throw this.create_field_error('validator_error', 'Path "' + this.path + '" is lower than min date', value);
		}
	}

	if(this.options.max !== undefined) {
		const max_date = this.cast(this.options.max);

		if(value.getTime() > max_date.getTime()) {
			throw this.create_field_error('validator_error', 'Path "' + this.path + '" is greater than max date', value);
		}
	}
};

function BooleanFieldType(path_value, options) {
	BaseFieldType.call(this, path_value, options);
	this.instance = 'Boolean';
}

BooleanFieldType.prototype = Object.create(BaseFieldType.prototype);
BooleanFieldType.prototype.constructor = BooleanFieldType;

BooleanFieldType.prototype.cast = function (value) {
	if(value === undefined || value === null) {
		return value;
	}

	if(boolean_convert_to_true.has(value)) {
		return true;
	}

	if(boolean_convert_to_false.has(value)) {
		return false;
	}

	throw this.create_field_error('cast_error', 'Cast to Boolean failed for path "' + this.path + '"', value);
};

function UUIDv7FieldType(path_value, options) {
	BaseFieldType.call(this, path_value, options);
	this.instance = 'UUIDv7';
	this.validators.push({
		kind: 'uuidv7'
	});
}

UUIDv7FieldType.prototype = Object.create(BaseFieldType.prototype);
UUIDv7FieldType.prototype.constructor = UUIDv7FieldType;

UUIDv7FieldType.prototype.cast = function (value) {
	if(value === undefined || value === null) {
		return value;
	}

	if(typeof value !== 'string') {
		throw this.create_field_error('cast_error', 'Cast to UUIDv7 failed for path "' + this.path + '"', value);
	}

	const normalized_value = value.toLowerCase();

	if(!uuidv7_pattern.test(normalized_value)) {
		throw this.create_field_error('cast_error', 'Cast to UUIDv7 failed for path "' + this.path + '"', value);
	}

	return normalized_value;
};

function BufferFieldType(path_value, options) {
	BaseFieldType.call(this, path_value, options);
	this.instance = 'Buffer';
}

BufferFieldType.prototype = Object.create(BaseFieldType.prototype);
BufferFieldType.prototype.constructor = BufferFieldType;

BufferFieldType.prototype.cast = function (value) {
	if(value === undefined || value === null) {
		return value;
	}

	if(Buffer.isBuffer(value)) {
		return value;
	}

	if(typeof value === 'string') {
		return Buffer.from(value);
	}

	if(typeof value === 'number' && Number.isFinite(value)) {
		return Buffer.from([value & 255]);
	}

	if(Array.isArray(value)) {
		try {
			return Buffer.from(value);
		} catch(error) {
			throw this.create_field_error('cast_error', 'Cast to Buffer failed for path "' + this.path + '"', value);
		}
	}

	if(value && value.type === 'Buffer' && Array.isArray(value.data)) {
		try {
			return Buffer.from(value.data);
		} catch(error) {
			throw this.create_field_error('cast_error', 'Cast to Buffer failed for path "' + this.path + '"', value);
		}
	}

	throw this.create_field_error('cast_error', 'Cast to Buffer failed for path "' + this.path + '"', value);
};

function MixedFieldType(path_value, options) {
	BaseFieldType.call(this, path_value, options);
	this.instance = 'Mixed';
}

MixedFieldType.prototype = Object.create(BaseFieldType.prototype);
MixedFieldType.prototype.constructor = MixedFieldType;

MixedFieldType.prototype.cast = function (value) {
	return value;
};

function ArrayFieldType(path_value, options) {
	BaseFieldType.call(this, path_value, options);
	this.instance = 'Array';
	this.of_field_type = options ? options.of_field_type || null : null;
}

ArrayFieldType.prototype = Object.create(BaseFieldType.prototype);
ArrayFieldType.prototype.constructor = ArrayFieldType;

ArrayFieldType.prototype.resolve_default = function (context_value) {
	if(this.options.default !== undefined) {
		return BaseFieldType.prototype.resolve_default.call(this, context_value);
	}

	return [];
};

ArrayFieldType.prototype.cast = function (value, context_value) {
	if(value === undefined || value === null) {
		return value;
	}

	if(!Array.isArray(value)) {
		throw this.create_field_error('cast_error', 'Cast to Array failed for path "' + this.path + '"', value);
	}

	if(!this.of_field_type) {
		return value;
	}

	const casted_array = [];
	let value_index = 0;

	while(value_index < value.length) {
		const array_value = value[value_index];
		const casted_item = this.of_field_type.normalize(array_value, {
			path: this.path + '.' + value_index,
			parent_path: this.path,
			parent_instance: this.instance,
			parent_context: context_value || {}
		});

		casted_array.push(casted_item);
		value_index += 1;
	}

	return casted_array;
};

function MapFieldType(path_value, options) {
	BaseFieldType.call(this, path_value, options);
	this.instance = 'Map';
	this.of_field_type = options ? options.of_field_type || null : null;
}

MapFieldType.prototype = Object.create(BaseFieldType.prototype);
MapFieldType.prototype.constructor = MapFieldType;

MapFieldType.prototype.cast = function (value, context_value) {
	if(value === undefined || value === null) {
		return value;
	}

	const map_output = {};
	let source_entries = null;

	if(value instanceof Map) {
		source_entries = Array.from(value.entries());
	} else if(value && typeof value === 'object' && !Array.isArray(value) && !Buffer.isBuffer(value) && !(value instanceof Date)) {
		source_entries = Object.entries(value);
	} else {
		throw this.create_field_error('cast_error', 'Cast to Map failed for path "' + this.path + '"', value);
	}

	let entry_index = 0;

	while(entry_index < source_entries.length) {
		const source_entry = source_entries[entry_index];
		const map_key = source_entry[0];
		const map_value = source_entry[1];

		if(typeof map_key !== 'string') {
			throw this.create_field_error('cast_error', 'Map key must be a string for path "' + this.path + '"', map_key);
		}

		if(this.of_field_type) {
			map_output[map_key] = this.of_field_type.normalize(map_value, {
				path: this.path + '.' + map_key,
				parent_path: this.path,
				parent_instance: this.instance,
				parent_context: context_value || {}
			});
		} else {
			map_output[map_key] = map_value;
		}

		entry_index += 1;
	}

	return map_output;
};

function get_foundational_field_types() {
	return {
		String: {
			constructor: StringFieldType,
			references: [String, 'String']
		},

		Number: {
			constructor: NumberFieldType,
			references: [Number, 'Number']
		},

		Date: {
			constructor: DateFieldType,
			references: [Date, 'Date']
		},

		Boolean: {
			constructor: BooleanFieldType,
			references: [Boolean, 'Boolean']
		},

		UUIDv7: {
			constructor: UUIDv7FieldType,
			references: [uuidv7_type_reference, 'UUIDv7']
		},

		Buffer: {
			constructor: BufferFieldType,
			references: [Buffer, 'Buffer']
		},

		Mixed: {
			constructor: MixedFieldType,
			references: ['Mixed', Object]
		},

		Array: {
			constructor: ArrayFieldType,
			references: [Array, 'Array']
		},

		Map: {
			constructor: MapFieldType,
			references: [Map, 'Map']
		},

		// Advanced FieldTypes
		Decimal128: {
			constructor: Decimal128FieldType,
			references: [decimal128_type_reference, 'Decimal128']
		},

		BigInt: {
			constructor: BigIntFieldType,
			references: [BigInt, 'BigInt']
		},

		Double: {
			constructor: DoubleFieldType,
			references: [double_type_reference, 'Double']
		},

		Int32: {
			constructor: Int32FieldType,
			references: [int32_type_reference, 'Int32']
		},

		Union: {
			constructor: UnionFieldType,
			references: [union_type_reference, 'Union']
		}
	};
}

export {
	// Type references
	decimal128_type_reference,
	double_type_reference,
	int32_type_reference,
	union_type_reference,
	uuidv7_type_reference,

	// FieldType constructors
	ArrayFieldType,
	BigIntFieldType,
	BooleanFieldType,
	BufferFieldType,
	DateFieldType,
	Decimal128FieldType,
	DoubleFieldType,
	Int32FieldType,
	MapFieldType,
	MixedFieldType,
	NumberFieldType,
	StringFieldType,
	UnionFieldType,
	UUIDv7FieldType,

	// Registry entries
	get_foundational_field_types,

	// Constants
	boolean_convert_to_false,
	boolean_convert_to_true,
	uuidv7_pattern
};
