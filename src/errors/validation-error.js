export default function ValidationError(message, details) {
	this.name = 'validation_error';
	this.message = message || 'Validation failed';
	this.details = details || null;

	if(Error.captureStackTrace) {
		Error.captureStackTrace(this, ValidationError);
	}
}

ValidationError.prototype = Object.create(Error.prototype);
ValidationError.prototype.constructor = ValidationError;

ValidationError.prototype.to_json = function () {
	return {
		success: false,
		error: {
			type: 'validation_error',
			message: this.message,
			details: this.details
		}
	};
};
