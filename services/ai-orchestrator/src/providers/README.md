# Provider layer

Lapisan ini menetapkan profile dan boundary transport provider.
`base.ts` menjadi kontrak provider; transport konkret berada di `transports/`.
Gemini existing tetap legacy dan dibekukan sampai konsolidasi Phase 6.
Phase 1 hanya membuat boundary kosong.
Provider tidak boleh menyimpan conversation loop kedua.
