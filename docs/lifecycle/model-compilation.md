# Model Compilation

This note explains what the model factory produces and why JsonBadger creates one concrete `Model` constructor per model definition.

## Quick Example

```js
const connection = await JsonBadger.connect(uri, options);

const User = connection.model({
	name: 'User',
	schema: user_schema,
	table_name: 'users'
});
```

That `User` value is not the shared base `Model`. It is a compiled constructor created for that specific schema, connection, and model configuration.

## Why Compilation Exists

The base `Model` in `src/model/model.js` provides shared behavior such as query helpers, document methods, validation flow, and persistence entry points.

The factory step in `src/model/factory/index.js` turns that shared behavior into a concrete runtime constructor that is bound to one definition. Without that step, the runtime would have nowhere to attach per-model state such as schema metadata, resolved options, and connection ownership.

## Current Flow

```js
const User = connection.model({
	name: 'User',
	schema: user_schema,
	table_name: 'users'
});
```

The current compilation flow is:

1. `Connection.model(...)`
   1. validates the registration input
   2. resolves model options such as `table_name`
   3. delegates compilation to `src/model/factory/index.js`
2. `model_factory(...)`
   1. creates a fresh concrete constructor for that definition
   2. wires inheritance against the base `Model`
   3. binds schema, options, runtime state, and connection onto the compiled constructor
3. `Connection.model(...)`
   1. registers the compiled constructor
   2. returns it to user code

## What The Factory Produces

The model factory creates a fresh constructor function and then links it to the shared base `Model` chain.

At a high level, the compiled constructor gets:

1. Shared static behavior through `Object.setPrototypeOf(model, Model)`.
2. Shared instance behavior through `Object.setPrototypeOf(model.prototype, Model.prototype)`.
3. Definition-specific static state such as:
   1. `model.schema`
   2. `model.options`
   3. `model.state`
   4. `model.connection`
4. Definition-specific instance access through `model.prototype.connection`.

This is why each model definition needs its own constructor instance.

## Base Model vs Compiled Model

### Base `Model`

The base `Model` is the shared behavior template.

It defines the common runtime surface used by all compiled models, including:

1. document construction
2. instance reads and writes
3. validation flow
4. `save`, `insert`, `update`, and `delete` entry points
5. static query and migration helpers

### Compiled Model

A compiled model is the concrete constructor returned by `connection.model(...)`.

It carries the definition-specific runtime context needed for real work:

1. one schema instance
2. one resolved model-options object
3. one owning connection
4. one model-level runtime state bucket

## Why A Detached Constructor Helper Is Not Enough

The important architectural point is not just "create a constructor." The important point is where that happens.

Model construction belongs inside the compiler/factory step because that is the place where JsonBadger already has the full definition context:

1. schema
2. resolved model options
3. owning connection

That keeps the lifecycle cohesive. A detached helper that only returns a constructor would still need the compiler step to finish wiring the actual runtime state, so it would split one responsibility across two places without simplifying the design.

## Mental Model

Use this distinction when reading the codebase:

1. `src/model/model.js` defines the shared model behavior.
2. `src/model/factory/index.js` compiles one concrete model constructor.
3. `src/connection/connection.js` owns registration and returns compiled models to user code.

So when application code holds `User`, `Post`, or `Invoice`, it is holding a compiled model constructor, not the shared base `Model` itself.
