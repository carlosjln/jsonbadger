# Connection API

## TOC

- [Connection API](#connection-api)
- [connect](#connect)
- [Connection Options](#connection-options)
- [Connection Lifecycle](#connection-lifecycle)
- [UUIDv7 Compatibility](#uuidv7-compatibility)
- [Connection Reuse Pattern](#connection-reuse-pattern)
- [Cross-File Example](#cross-file-example)

## connect

```js
const connection = await JsonBadger.connect(uri, options);
```

`connect(...)` opens a PostgreSQL pool and returns a `Connection` instance.

## Connection Options

- `max`: pool size
- `debug`: logs SQL/debug events when `true`
- `auto_index`: server-wide default for automatic index creation when `Model.ensure_table()` is called
- `id_strategy`: server-wide default row-id strategy (`IdStrategies.bigserial` or `IdStrategies.uuidv7`)
- any supported `pg` pool options (`ssl`, `host`, `port`, `user`, `password`, `database`)

## Connection Lifecycle

Close the connection through the returned instance:

```js
const connection = await JsonBadger.connect(uri, options);
await connection.disconnect();
```

## UUIDv7 Compatibility

- `connect(...)` performs a PostgreSQL capability scan and caches the result
- if connection-level `id_strategy` resolves to `IdStrategies.uuidv7` and native support is unavailable, `connect(...)` fails fast
- later model-level `uuidv7` overrides are checked against the cached capability info

> **Note:** Troubleshooting SQL like `SELECT version();` and `SHOW server_version;` is optional. Runtime checks are machine-readable and internal.

## Connection Reuse Pattern

If your app wants one shared connection, keep the returned instance and reuse it explicitly.

```js
import JsonBadger from 'jsonbadger';

let shared_connection = null;

export async function connect_db() {
	if(shared_connection) {
		return shared_connection;
	}

	const uri = 'postgresql://user:pass@localhost:5432/dbname';
	const options = {max: 10, debug: false};

	shared_connection = await JsonBadger.connect(uri, options);
	return shared_connection;
}
```

Repeated calls to your own bootstrap helper reuse the same connection:

```js
const connection_a = await connect_db();
const connection_b = await connect_db();

connection_a === connection_b;
// returns: true
```

## Cross-File Example

Keep the connection bootstrap separate from model and controller code.

`config/db.js`

```js
import JsonBadger from 'jsonbadger';

let shared_connection = null;

export async function connect_db() {
	if(shared_connection) {
		return shared_connection;
	}

	const uri = 'postgresql://user:pass@localhost:5432/dbname';
	const options = {max: 10, debug: false};

	shared_connection = await JsonBadger.connect(uri, options);
	return shared_connection;
}
```

`models/user-model.js`

```js
import JsonBadger from 'jsonbadger';
import {connect_db} from '../config/db.js';

const connection = await connect_db();
const user_schema = new JsonBadger.Schema({
	username: {type: String, required: true, index: true},
	email: {type: String, required: true, index: {unique: true, name: 'idx_users_email_unique'}}
});

export const user_model = connection.model({name: 'User', schema: user_schema, table_name: 'users'});
```

`controllers/user-controller.js`

```js
import {user_model} from '../models/user-model.js';

export async function get_users(req, res) {
	const users = await user_model.find({}).exec();
	return res.json(users);
}
```

`app.js`

```js
import express from 'express';
import {connect_db} from './config/db.js';
import {get_users} from './controllers/user-controller.js';

const app = express();

await connect_db();

app.get('/users', get_users);
app.listen(3000);
```

What to expect:
- `find(...).exec()` returns document instances
- `find_one(...).exec()` returns one document instance or `null`
- `save()`, `update_one(...)`, and `delete_one(...)` return document instances
