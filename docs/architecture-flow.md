# Architecture Flow

This page shows the current JsonBadger runtime flow as ASCII diagrams.

## 1. Bootstrap

```text
User code
   |
   v
public API entry
   |
   +--> connect()
   +--> Schema
   +--> field_type
   +--> field_types
```

Important:

- there is no root `disconnect()`
- there is no root `model()`
- the public API is Connection-first

## 2. Connection Flow

```text
User
   |
   v
JsonBadger.connect(uri, options)
   |
   v
connection bootstrap
   |
   +--> validate options / id_strategy
   +--> create pg.Pool
   +--> SELECT 1
   +--> scan server capabilities
   +--> create Connection(pool_instance, options, server_capabilities)
   |
   v
returns Connection
```

Important:

- each `connect(...)` call creates a new `Connection`
- there is no process-global current connection
- if you want reuse, cache the returned `Connection` explicitly

## 3. Connection Ownership

```text
Connection
   |
   +--> owns pool_instance
   +--> owns options
   +--> owns server_capabilities
   +--> owns model registry
   +--> exposes:
         - model(model_definition)
         - disconnect()
```

## 4. Schema Flow

```text
User
   |
   v
new Schema(schema_definition, options)
   |
   v
Schema
   |
   +--> inject base fields: id / created_at / updated_at
   +--> compile schema definition
   +--> build introspection paths
   +--> normalize inline index declarations
   +--> normalize slug options
   +--> configure validators by slug bucket
   +--> register schema instance methods via Schema.method(...)
   +--> store:
         - paths
         - indexes
         - options
         - methods
         - aliases
```

Important:

- slug ownership belongs to `Schema`
- schema methods are later installed on compiled model constructors

## 5. Model Registration Flow

```text
User
   |
   v
connection.model({name, schema, table_name, ...})
   |
   v
Connection.model(...)
   |
   +--> build model options from model_definition
   +--> derive table_name from name when omitted
   +--> return existing model when schema/options match
   +--> throw ModelOverwriteError on conflicting redefinition
   +--> build compiled model constructor/runtime
```

Compiled model owns:

- `schema`
- `options`
- `connection`
- `state`

Document runtime exposes:

- built-in instance methods like `get`, `set`, `save`, `insert`, and `update`
- schema-defined instance methods copied from `schema.methods`

## 6. Construction Flow

```text
User
   |
   +--> Model.from(input)
   |     |
   |     +--> normalize external payload input
   |     +--> route keys into default slug / extra slugs
   |     +--> schema.validate(document)
   |     +--> new Model(document)
   |
   +--> Model.hydrate(row)
         |
         +--> normalize row-like input
         +--> read schema.get_slugs() from row roots
         +--> schema.validate(document)
         +--> new Model(document)
         +--> instance.is_new = false
         +--> tracker rebase
```

## 7. Read Query Flow

```text
User
   |
   v
model constructor read methods
   |
   +--> Model.find(...)
   +--> Model.find_one(...)
   +--> Model.count_documents(...)
   |
   v
query builder
   |
   +--> where_compiler(...)
   +--> sort_compiler(...)
   +--> limit_skip_compiler(...)
   +--> sql_runner(sql_text, params, Model.connection)
   |
   v
Connection.pool_instance.query(...)
   |
   v
PostgreSQL
```

Hydration path for document-returning reads:

```text
query row
   |
   v
Model.hydrate(...)
   |
   v
document instance
```

## 8. Write Flow

```text
User
   |
   +--> Model.from(...).save()
   |     |
   |     +--> Model.insert_one(...)
   |     +--> exec_insert_one(...)
   |     +--> sql_runner(..., Model.connection)
   |
   +--> hydrated_doc.set(...).save()
   |     |
   |     +--> schema.validate(document)
   |     +--> build tracker delta
   |     +--> Model.update_one(...)
   |     +--> exec_update_one(...)
   |     +--> sql_runner(..., Model.connection)
   |
   +--> Model.delete_one(...)
         |
         +--> delete compiler
         +--> where_compiler(...)
         +--> sql_runner(..., Model.connection)
```

## 9. Migration And Index Flow

```text
App startup / bootstrap
   |
   v
Model.ensure_table()
   |
   +--> table migration helper
   +--> execute through explicit Connection

Model.ensure_indexes()
   |
   +--> resolve schema indexes
   +--> index migration helper
   +--> execute through explicit Connection

Model.ensure_model()
   |
   +--> ensure table
   +--> ensure schema indexes when auto_index is enabled
   +--> execute through explicit Connection
```

Important:

- run `ensure_*` helpers during startup/bootstrap
- normal runtime read/write operations do not provision tables or indexes implicitly

## Ownership Summary

```text
Connection
  |
  +--> owns one pool
  +--> owns one capability snapshot
  +--> owns one model registry
  |
  +--> compiled models are created through Connection.model(...)
  |     and execute through their owning Connection
  |
  +--> Schema owns paths, indexes, slug ownership, options, and schema-defined methods
  |
  +--> document instances receive built-in runtime methods plus schema-defined methods
  |
  +--> sql_runner is bound to explicit Connection context
```

Important:

- there is no architectural singleton underneath the public API
- any future root-level convenience must be layered on top, not treated as core runtime state
