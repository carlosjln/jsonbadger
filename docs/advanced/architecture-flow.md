# Architecture Flow

Use this page for architecture review and contributor work. If you only want to use the library, start with [`../examples.md`](../examples.md).

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
   +--> validate options
   +--> create pg.Pool
   +--> SELECT 1
   +--> scan server capabilities
   +--> create Connection(pool_instance, options, server_capabilities)
   +--> on bootstrap failure:
         - close_pool_quietly(pool_instance)
         - rethrow original error
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
   +--> owns normalized options
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
   +--> build aliases
   +--> build conform tree
   +--> configure validators:
         - base field validator
         - slug-slice validators
   +--> register field-defined indexes
   +--> register schema instance methods via Schema.add_method(...)
   +--> store:
          - paths
          - indexes
          - options
          - id_strategy
          - auto_index
          - methods
          - aliases
          - validators
          - $conform_tree
```

Important:

- slug ownership belongs to `Schema`
- `Schema` owns the final runtime `id_strategy`
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
   +--> validate model_definition.name
   +--> build model options from model_definition
   +--> derive table_name from name when omitted
   +--> return existing model when schema/options match
   +--> throw ModelOverwriteError on conflicting redefinition
   +--> require schema instanceof Schema
   +--> build compiled model constructor/runtime
```

Compiled model owns:

- `$name`
- `schema`
- `options`
- `connection`
- `state`

Document runtime exposes:

- built-in instance methods like `get`, `set`, `save`, `insert`, and `update`
- schema-defined instance methods copied from `schema.methods`

## 6. Construction Flow

New payload intake:

```text
External payload
   |
   v
Model.from(...)
   |
   v
extract_from_document_fields(...)
   |
   +--> serialize non-plain input
   +--> expand dotted payload keys
   +--> route base fields / default slug / extra slugs
   |
   v
new Model(document)
   |
   v
instance.$normalize({mode: 'from'})
   |
   +--> instance.$conform_document(...)
   +--> instance.$apply_defaults(...)
   +--> instance.$cast(...)
   +--> instance.$validate(...)
   |
   v
instance.document.$rebase_changes()
   |
   v
new document instance
```

Persisted row intake:

```text
Raw row from SQL
   |
   v
Model.hydrate(...)
   |
   v
extract_hydrated_document_fields(...)
   |
   +--> serialize non-plain row input
   +--> copy base fields from row root
   +--> read schema.get_slugs() from row roots
   |
   v
new Model(document)
   |
   v
instance.$normalize({mode: 'hydrate'})
   |
   +--> instance.$conform_document(...)
   +--> instance.$apply_defaults(...)
   +--> instance.$cast(...)
   +--> instance.$validate(...)
   |
   v
instance.document.$rebase_changes()
   |
   v
instance.is_new = false
   |
   v
rebased persisted model instance
```

Manual low-level path:

```text
const instance = new UserModel(document)
   |
   +--> raw tracked document state only
   +--> no conform / defaults / cast / validate yet
   |
   +--> instance.$conform_document(...)
   +--> instance.$apply_defaults(...)
   +--> instance.$cast(...)
   +--> instance.$validate(...)
   +--> or instance.$normalize(...)
   +--> optionally instance.document.$rebase_changes()
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
   +--> where_compiler(..., {schema, data_column, id_strategy})
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
   +--> row_to_document(...)
   |     - id -> string|null
   |     - data -> object fallback
   |     - created_at / updated_at -> ISO timestamp
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
   +--> Model.insert_one(plain_input)
   |     |
   |     +--> Model.from(...)
   |     +--> doc.insert()
   |     +--> schema.validate(document)
   |     +--> apply_timestamps(document)
   |     +--> exec_insert_one(...)
   |     +--> sql_runner(..., Model.connection)
   |     +--> raw inserted row
   |     +--> rebase same instance
   |
   +--> Model.from(...).save()
   |     |
   |     +--> doc.insert()
   |     +--> schema.validate(document)
   |     +--> apply_timestamps(document)
   |     +--> exec_insert_one(...)
   |     +--> sql_runner(..., Model.connection)
   |     +--> raw inserted row
   |     +--> rebase same instance
   |
   +--> hydrated_doc.save()
   |     |
   |     +--> schema.validate(document)
   |     +--> set updated_at
   |     +--> require id for persisted update
   |     +--> build tracker delta
   |     +--> exec_update_one(...)
   |     +--> sql_runner(..., Model.connection)
   |     +--> raw updated row
   |     +--> rebase current document
   |
   +--> Model.update_one(filter, update_definition)
   |     |
   |     +--> normalize update gateway
   |     +--> normalize update definition
   |     +--> JsonbOps.from(...)
   |     +--> where_compiler(..., {schema, data_column, id_strategy})
   |     +--> exec_update_one(...)
   |     +--> sql_runner(..., Model.connection)
   |     +--> raw updated row
   |     +--> Model.hydrate(row)
   |
   +--> Model.delete_one(...)
          |
          +--> where_compiler(..., {schema, data_column, id_strategy})
          +--> sql_runner(..., Model.connection)
          +--> raw deleted row
          +--> Model.hydrate(row)
```

## 9. Migration And Index Flow

```text
App startup / bootstrap
   |
   v
Model.ensure_table()
   |
   +--> read model.schema.id_strategy
   +--> if uuidv7: assert server capability snapshot
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
   +--> ensure schema indexes when schema.auto_index is enabled
   +--> execute through explicit Connection
```

Important:

- run `ensure_*` helpers during startup/bootstrap
- `uuidv7` capability is enforced at `Model.ensure_table()`, not at `connect(...)`
- normal runtime read/write operations do not provision tables or indexes implicitly

## Ownership Summary

```text
Connection
  |
  +--> owns one pool
  +--> owns normalized connection options
  +--> owns one capability snapshot
  +--> owns one model registry
  |
Schema
  |
  +--> owns paths, indexes, slug ownership, aliases, and validators
  +--> owns id_strategy and auto_index
  +--> owns the document conform tree
  |
Model
  |
  +--> is compiled through Connection.model(...)
  +--> owns schema/options/connection bindings
  +--> reads model.schema.id_strategy as final runtime truth
  +--> executes through its owning Connection
  |
Document instances
  |
  +--> receive built-in runtime methods plus schema-defined methods
  |
SQL execution
  |
  +--> stays bound to explicit Connection context
```

Important:

- there is no architectural singleton underneath the public API
- any future root-level convenience must be layered on top, not treated as core runtime state
