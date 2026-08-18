# State layer

Lapisan ini adalah target SessionDB durable dengan schema, search, WAL, FTS5,
dan lineage. `session-db.ts` menjadi façade storage pada Phase 4–6.
Phase 1 tidak membuka database atau memilih dependency SQLite.
Store JSON/in-memory existing tetap tidak disentuh.
State harus dipersist sebelum side effect pada loop target.
