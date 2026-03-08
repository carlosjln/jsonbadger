function ModelOverwriteError(message, details) {
	this.name = 'model_overwrite_error';
	this.message = message || 'Model overwrite failed';
	this.details = details || null;

	if(Error.captureStackTrace) {
		Error.captureStackTrace(this, ModelOverwriteError);
	}
}

ModelOverwriteError.prototype = Object.create(Error.prototype);
ModelOverwriteError.prototype.constructor = ModelOverwriteError;

ModelOverwriteError.prototype.to_json = function () {
	return {
		success: false,
		error: {
			type: 'model_overwrite_error',
			message: this.message,
			details: this.details
		}
	};
};

export default ModelOverwriteError;
