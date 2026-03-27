/*
 * MODULE RESPONSIBILITY
 * Expose the shared SQL builder and runner entry points.
 */
import build_update_query from '#src/sql/write/build-update-query.js';
import build_insert_query from '#src/sql/write/build-insert-query.js';
import build_delete_query from '#src/sql/write/build-delete-query.js';
import run from '#src/sql/run.js';

const sql = {
	build_delete_query,
	build_insert_query,
	build_update_query,
	run
};

export default sql;
