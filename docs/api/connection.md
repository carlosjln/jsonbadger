# Connection API

## TOC

- [Connection API](#connection-api)
- [connect](#connect)
- [disconnect](#disconnect)
- [Connection Options](#connection-options)
- [UUIDv7 Compatibility](#uuidv7-compatibility)
- [Shared Connection Pattern](#shared-connection-pattern)
- [Cross-File Example](#cross-file-example)

## connect

```js
await JsonBadger.connect(uri, options);
```

`connect(...)` opens or reuses the shared PostgreSQL pool.

## disconnect

```js
await JsonBadger.disconnect();
```

`disconnect()` closes the shared pool when connected.

## Connection Options

- `max`: pool size
- `debug`: logs SQL/debug events when `true`
- `auto_index`: server-wide default for automatic index creation when `Model.ensure_table()` is called
- `id_strategy`: server-wide default row-id strategy (`IdStrategies.bigserial` or `IdStrategies.uuidv7`)
- any supported `pg` pool options (`ssl`, `host`, `port`, `user`, `password`, `database`)

## UUIDv7 Compatibility

- `connect(...)` performs a PostgreSQL capability scan and caches the result
- if connection-level `id_strategy` resolves to `IdStrategies.uuidv7` and native support is unavailable, `connect(...)` fails fast
- later model-level `uuidv7` overrides are checked against the cached capability info

> **Note:** Troubleshooting SQL like `SELECT version();` and `SHOW server_version;` is optional. Runtime checks are machine-readable and internal.

## Shared Connection Pattern

Call `connect(...)` once at startup and reuse that shared pool across files.

```js
import JsonBadger from 'jsonbadger';

let shared_pool = null;

export async function connect_db() {
	if(shared_pool) {
		return shared_pool;
	}

	const uri = 'postgresql://user:pass@localhost:5432/dbname';
	const options = {max: 10, debug: false};

	shared_pool = await JsonBadger.connect(uri, options);
	return shared_pool;
}
```

Repeated calls reuse the same pool instance:

```js
const pool_a = await connect_db();
const pool_b = await connect_db();

pool_a === pool_b;
// returns: true
```

## Cross-File Example

Keep the connection bootstrap separate from model and controller code.

`config/db.js`

```js
import JsonBadger from 'jsonbadger';

let shared_pool = null;

export async function connect_db() {
	if(shared_pool) {
		return shared_pool;
	}

	const uri = 'postgresql://user:pass@localhost:5432/dbname';
	const options = {max: 10, debug: false};

	shared_pool = await JsonBadger.connect(uri, options);
	return shared_pool;
}
```

`models/user-model.js`

```js
import JsonBadger from 'jsonbadger';

const user_schema = new JsonBadger.Schema({
	username: {type: String, required: true, index: true},
	email: {type: String, required: true, index: {unique: true, name: 'idx_users_email_unique'}}
});

export const UserModel = JsonBadger.model(user_schema, {
	table_name: 'users'
});
```

`controllers/user-controller.js`

```js
import {UserModel} from '../models/user-model.js';

export async function get_users(req, res) {
	const users = await UserModel.find({}).exec();
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
- `doc.to_json()` and `doc.to_object()` return plain-object snapshots with top-level base fields
