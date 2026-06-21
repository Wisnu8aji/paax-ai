export function routeModel(taskComplexity: string) {
    if (taskComplexity === "high") return "gemini-1.5-pro";
    return "gemini-1.5-flash";
}
