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
   +--> register schema instance methods via Schema.method(...)
   +--> store:
         - $compiled_schema
         - paths
         - indexes
         - options
         - methods
```

Important:

- schema runtime methods are registered on the `schema_instance`
- those methods are later installed on document instances for model constructors using that schema

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
   +--> build model constructor/runtime
```

Model constructor owns:

- `model_name`
- `schema_instance`
- `model_options`
- `connection`

Document runtime exposes:

- built-in instance methods like `validate`, `get`, `set`, `save`, `$serialize`, `to_json`, and `delete().exec()`
- schema-defined instance methods copied from `schema_instance.methods`

## 6. Read Query Flow

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
Model.create_document_from_row(...)
   |
   v
document runtime layer
   |
   v
document instance
```

## 7. Write Flow

```text
User
   |
   +--> new Model(...).save()
   |     |
   |     +--> document runtime layer
   |     +--> Model.ensure_table()
   |     +--> sql_runner(..., Model.connection)
   |
   +--> Model.update_one(...)
   |     |
   |     +--> update compiler
   |     +--> where_compiler(...)
   |     +--> sql_runner(..., Model.connection)
   |
   +--> Model.delete_one(...)
         |
         +--> delete compiler
         +--> where_compiler(...)
         +--> sql_runner(..., Model.connection)
```

## 8. Migration And Index Flow

```text
Model.ensure_table()
   |
   +--> table migration helper
   +--> execute through explicit Connection

Model.ensure_index()
   |
   +--> resolve schema indexes
   +--> index migration helper
   +--> execute through explicit Connection

Model.ensure_schema()
   |
   +--> ensure table
   +--> ensure each normalized schema index
   +--> execute through explicit Connection
```

## Ownership Summary

```text
Connection
  |
  +--> owns one pool
  +--> owns one capability snapshot
  +--> owns one model registry
  |
  +--> model constructors are created through Connection.model(...)
  |     and execute through their owning Connection
  |
  +--> schema_instance owns schema paths, indexes, options, and schema-defined methods
  |
  +--> document instances receive built-in runtime methods plus schema-defined methods
  |
  +--> sql_runner is bound to explicit Connection context
```

Important:

- there is no architectural singleton underneath the public API
- any future root-level convenience must be layered on top, not treated as core runtime state

## Future Extension Point

If a future feature needs:

- root `JsonBadger.disconnect()`
- global connection reuse
- multiple tracked connections

then add a real registry on top of `Connection`.

Do not reintroduce:

- ambient current connection state
- hidden singleton execution lookup
- root `model(...)` as the primary ownership path
