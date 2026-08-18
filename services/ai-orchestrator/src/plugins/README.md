# Plugins and middleware

Lapisan ini adalah extension boundary untuk plugin, hooks, middleware, dan metrics.
`manager.ts` akan mengelola lifecycle plugin; `middleware.ts` menjadi hook boundary.
Phase 1 tidak memuat plugin atau menjalankan middleware.
Implementasi ditargetkan Phase 6.
Plugin tidak boleh mendaftarkan loop atau registry tool kedua.
