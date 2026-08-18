# Agent layer

Lapisan ini adalah rumah runtime dan satu conversation loop kanonik untuk
Command Room. Alurnya adalah `TurnContext` immutable → `conversation-loop.ts`
→ profile-selected `ProviderTransport` → response validator → `ToolExecutor`
dan `TurnJournal` → WorkEvent sink.

`runtime.ts` menjadi façade `AIAgent`; `initializeTurn()` hanya menyiapkan
konteks dan tidak memanggil provider atau tool. `runPreparedTurn()` menjalankan
satu loop bounded dengan `IterationBudget`, `AbortSignal`, retry sebelum side
effect, serta approval fail-closed.

`agentic/execution-loop.ts` tetap khusus `/agent-runs` dan bukan jalur Command
Room. Legacy Gemini/web handoff hanya boleh dipilih eksplisit sebagai rollback.
Journal Phase 3 masih in-memory; restart tidak mengklaim pemulihan durable.

Jangan membuat loop model kedua di layer ini atau di `apps/web`.
