export default function QueryError(message, details) {
	this.name = 'query_error';
	this.message = message || 'Query failed';
	this.details = details || null;

	if(Error.captureStackTrace) {
		Error.captureStackTrace(this, QueryError);
	}
}

QueryError.prototype = Object.create(Error.prototype);
QueryError.prototype.constructor = QueryError;

QueryError.prototype.to_json = function () {
	return {
		success: false,
		error: {
			type: 'query_error',
			message: this.message,
			details: this.details
		}
	};
};
