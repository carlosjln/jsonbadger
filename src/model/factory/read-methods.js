import QueryBuilder from '#src/query/query-builder.js';

/**
 * Installs query/read helpers on a model constructor.
 *
 * @param {Function} Model Model constructor.
 * @returns {void}
 */
function install_read_methods(Model) {
	Model.find = function (query_filter, projection_value) {
		return new QueryBuilder(Model, 'find', query_filter || {}, projection_value || null);
	};

	Model.find_one = function (query_filter) {
		return new QueryBuilder(Model, 'find_one', query_filter || {}, null);
	};

	Model.find_by_id = function (id_value) {
		return new QueryBuilder(Model, 'find_one', {id: id_value}, null);
	};

	Model.count_documents = function (query_filter) {
		return new QueryBuilder(Model, 'count_documents', query_filter || {}, null);
	};
}

export {
	install_read_methods
};
