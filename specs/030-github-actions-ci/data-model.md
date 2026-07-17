# Data Model: GitHub Actions CI

This feature introduces no application data model, database table, migration, or persisted domain entity.

The only temporary state is the disposable SQLite database already created per full quality-gate invocation. It is outside the repository's global catalog and is deleted after a successful run.

The workflow platform stores execution metadata and logs externally; this feature does not depend on reading or writing that metadata from application code.
