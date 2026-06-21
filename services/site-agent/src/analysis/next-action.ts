export function recommendNextActions(issues: string[]) {
    return issues.map(i => "Segera selesaikan: " + i);
}
