/*
Assumptions and trade-offs:
- Universal options are normalized here, while runtime-only behaviors are stored for later phases.
- Validation/casting fails fast per path and defers aggregation to schema_compiler.
*/
function BaseFieldType(path_value, options) {
	this.path = path_value;
	this.options = options || {};
	this.instance = 'Mixed';
	this.validators = [];
	this.regExp = null;
	this.enum_values = null;
	this.register_universal_validators();
}

BaseFieldType.prototype.register_universal_validators = function () {
	if(this.options.required !== undefined) {
		this.validators.push({
			kind: 'required'
		});
	}

	if(typeof this.options.validate === 'function') {
		this.validators.push({
			kind: 'custom'
		});
	}
};

BaseFieldType.prototype.create_field_error = function (code_value, message, value) {
	const field_error = new Error(message);
	field_error.code = code_value;
	field_error.path = this.path;
	field_error.value = value;
	return field_error;
};

BaseFieldType.prototype.is_required = function (context_value) {
	const required_option = this.options.required;

	if(typeof required_option === 'function') {
		return Boolean(required_option.call(null, context_value || {}));
	}

	return required_option === true;
};

BaseFieldType.prototype.resolve_default = function (context_value) {
	if(this.options.default === undefined) {
		return undefined;
	}

	if(typeof this.options.default === 'function') {
		return this.options.default.call(null, context_value || {});
	}

	return this.options.default;
};

BaseFieldType.prototype.apply_set = function (value, context_value) {
	if(typeof this.options.set !== 'function') {
		return value;
	}

	return this.options.set.call(null, value, context_value || {});
};

BaseFieldType.prototype.apply_get = function (value, context_value) {
	if(typeof this.options.get !== 'function') {
		return value;
	}

	return this.options.get.call(null, value, context_value || {});
};

BaseFieldType.prototype.cast = function (value) {
	return value;
};

BaseFieldType.prototype.run_custom_validator = function (value, context_value) {
	if(typeof this.options.validate !== 'function') {
		return;
	}

	let validator_result = false;

	try {
		validator_result = this.options.validate.call(null, value, context_value || {});
	} catch(error) {
		const message_value = error && error.message ? error.message : 'Custom validator failed for path "' + this.path + '"';
		throw this.create_field_error('validator_error', message_value, value);
	}

	if(!validator_result) {
		throw this.create_field_error('validator_error', 'Custom validator failed for path "' + this.path + '"', value);
	}
};

BaseFieldType.prototype.run_type_validators = function () {
	return;
};

BaseFieldType.prototype.validate = function (value, context_value) {
	this.run_custom_validator(value, context_value || {});
	this.run_type_validators(value, context_value || {});
};

BaseFieldType.prototype.normalize = function (value, context_value) {
	const normalized_context = context_value || {};
	let current_value = value;

	if(current_value === undefined) {
		current_value = this.resolve_default(normalized_context);
	}

	if(current_value === undefined || current_value === null) {
		if(this.is_required(normalized_context)) {
			throw this.create_field_error('required_error', 'Path "' + this.path + '" is required', current_value);
		}

		return current_value;
	}

	current_value = this.apply_set(current_value, normalized_context);
	current_value = this.cast(current_value, normalized_context);
	this.validate(current_value, normalized_context);
	return current_value;
};

BaseFieldType.prototype.to_introspection = function () {
	return {
		path: this.path,
		instance: this.instance,
		validators: this.validators,
		regExp: this.regExp || null,
		enum_values: this.enum_values || null
	};
};

export default BaseFieldType;
