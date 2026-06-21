export function compareProgress(actual: number, planned: number) {
    if (actual < planned) return "Terlambat";
    if (actual > planned) return "Lebih Cepat";
    return "Sesuai Jadwal";
}
