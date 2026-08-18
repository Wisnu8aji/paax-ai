# Gateway layer

Lapisan ini menghubungkan platform, session, streaming, dan runtime agent.
`run.ts` akan menjadi GatewayRunner; `session.ts` memegang identitas session.
Route Next.js existing tetap menjadi surface/gateway sementara.
Implementasi service ditargetkan Phase 2–6.
Gateway tidak boleh memiliki conversation loop atau provider call kedua.
