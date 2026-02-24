# local postgres testing

1. copy `.env.example` to `.env`.
2. update `.env` values for your local PostgreSQL user/database.
3. run `npm run test-integration`.
4. run `npm run test-all` to run unit + local integration suites.

environment variables
- `APP_POSTGRES_URI`: required full PostgreSQL connection URI.
- `APP_POSTGRES_SSL`: `true` or `false`.
- `APP_DEBUG`: `true` or `false`.
- `APP_POOL_MAX`: max pool size.

notes
- the local integration test generates a unique table name per run and drops it afterward.
- this keeps table creation checks in-scope and avoids static table-name config in `.env`.
- `npm test` only runs unit tests.
