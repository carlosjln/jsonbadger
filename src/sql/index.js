import build_update_query from '#src/sql/build-update-query.js';
import build_insert_query from '#src/sql/build-insert-query.js';
import build_delete_query from '#src/sql/build-delete-query.js';
import sql_run from '#src/sql/sql-run.js';

const sql = {
	build_delete_query,
	build_insert_query,
	build_update_query,
	run: sql_run
};

export default sql;
