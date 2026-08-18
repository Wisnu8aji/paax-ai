# Cron layer

Lapisan ini adalah boundary background jobs dan scheduler worker.
`jobs.ts` akan mendefinisikan job yang dapat diaudit; `scheduler.ts` mengatur tick.
Phase 1 hanya membuat lokasi dan barrel kosong.
Implementasi ditargetkan Phase 4–6.
Cron memulai runtime yang sama, bukan loop model baru.
