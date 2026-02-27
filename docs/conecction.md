# Connection

This guide shows how to cleanly connect to your database and reuse the same shared pool across files.

## 1. Database Connection (`config/db.js`)

This file connects once at app startup. All models and controllers then use that shared connection.

```js
import jsonbadger from 'jsonbadger';

let shared_pool = null;

export async function connect_db() {
	if(shared_pool) {
		return shared_pool;
	}

	const db_uri = 'postgresql://user:pass@localhost:5432/dbname';
	const db_connection_options = {max: 10, debug: false};

	try {
		shared_pool = await jsonbadger.connect(db_uri, db_connection_options);

		// returns: shared pg Pool instance
		return shared_pool;
	} catch(error) {
		console.error('initial connection failure:', error.message);
		process.exit(1);
	}
}
```

## 2. Data Model (`models/user-model.js`)

Keep this file focused on data mapping only.

```js
import jsonbadger from 'jsonbadger';

const user_schema = new jsonbadger.Schema({
	username: {type: String, required: true, index: true},
	email: {type: String, required: true, index: {unique: true, name: 'idx_users_email_unique'}},
});

export const UserModel = jsonbadger.model(user_schema, {
	table_name: 'users',
	data_column: 'data'
});
```

## 3. Domain Entity (`entities/user-entity.js`)

Entity wraps model operations and domain behavior.

```js
import {UserModel} from '../models/user-model.js';

export class User {
	constructor(username, email) {
		this.username = username;
		this.email = email;
	}

	static async get_all() {
		const docs = await UserModel.find({}).exec();
		// returns: [{ username: 'john', email: 'john@example.com', ... }, ...]
		return docs;
	}

	async save() {
		const user_doc = new UserModel(this);
		const saved_doc = await user_doc.save();
		// returns: { username: 'john', email: 'john@example.com', ... }

		return saved_doc;
	}
}
```

## 4. Web Controller (`controllers/user-controller.js`)

Controller handles HTTP and delegates data logic to the entity.

```js
import {User} from '../entities/user-entity.js';

export async function get_users(req, res) {
	try {
		const users = await User.get_all();
		// returns: [{ username: 'john', email: 'john@example.com', ... }, ...]

		return res.json({
			success: true,
			count: users.length,
			data: users
		});
	} catch(error) {
		return res.status(500).json({success: false, error: error.message});
	}
}

export async function create_user(req, res) {
	try {
		const {username, email} = req.body;
		const user_entity = new User(username, email);
		const saved_user = await user_entity.save();
		// returns: { username: 'john', email: 'john@example.com', ... }

		return res.status(201).json({success: true, data: saved_user});
	} catch(error) {
		return res.status(500).json({success: false, error: error.message});
	}
}
```

## 5. Entry Point (`app.js`)

Initialize the database before serving requests.

```js
import express from 'express';
import {connect_db} from './config/db.js';
import {get_users, create_user} from './controllers/user-controller.js';

const app = express();
app.use(express.json());

async function bootstrap() {
	await connect_db();

	app.get('/users', get_users);
	app.post('/users', create_user);

	const port = 3000;
	app.listen(port, () => {
		console.log(`Server running on port ${port}`);
	});
}

bootstrap().catch((error) => {
	console.error('startup failure:', error.message);
	process.exit(1);
});
```

## 6. Shared Instance Proof

You can verify connection reuse directly:

```js
import {connect_db} from './config/db.js';

const pool_a = await connect_db();
const pool_b = await connect_db();

const is_same_pool = pool_a === pool_b;
// returns: true
```

## What to expect

- Connection bootstrap can be called from many files, but all calls reuse the same shared pool in one runtime.
- `find(...).exec()` returns arrays of plain data objects.
- `find_one(...).exec()` returns one plain data object or `null`.
- `count_documents(...).exec()` returns a number.
- Entity-level rules stay out of controllers and model declarations.