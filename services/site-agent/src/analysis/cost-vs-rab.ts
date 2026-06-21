export function compareCost(actual: number, rab: number) {
    if (actual > rab) return "Overbudget";
    return "Under budget atau Sesuai";
}
