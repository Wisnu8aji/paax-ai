import type { AhspTemplate, CalculatedWorkItem, WorkItem } from "../types";

export interface CostBreakdown {
  materialCost: number;
  laborCost: number;
  unitCost: number;
}

export function roundCurrency(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

export function calculateAhspUnitCost(
  template: AhspTemplate,
  materialPrices: Record<string, number>,
  laborPrices: Record<string, number>,
): CostBreakdown {
  const materialCost = template.materials.reduce((sum, item) => {
    return sum + item.coefficient * (materialPrices[item.key] ?? 0);
  }, 0);

  const laborCost = template.labor.reduce((sum, item) => {
    return sum + item.coefficient * (laborPrices[item.key] ?? 0);
  }, 0);

  return {
    materialCost: roundCurrency(materialCost),
    laborCost: roundCurrency(laborCost),
    unitCost: roundCurrency(materialCost + laborCost),
  };
}

export function calculateWorkItem(
  item: WorkItem,
  templates: AhspTemplate[],
  materialPrices: Record<string, number>,
  laborPrices: Record<string, number>,
  overheadPercentage: number,
): CalculatedWorkItem {
  const template = templates.find((candidate) => candidate.code === item.ahspCode);
  const breakdown =
    item.ahspCode === "custom" || !template
      ? {
          materialCost: 0,
          laborCost: 0,
          unitCost: roundCurrency(item.customUnitPrice ?? 0),
        }
      : calculateAhspUnitCost(template, materialPrices, laborPrices);

  const directCost = roundCurrency(breakdown.unitCost * item.volume);
  const overheadCost = roundCurrency(directCost * (overheadPercentage / 100));

  return {
    ...item,
    unitCost: breakdown.unitCost,
    directCost,
    overheadCost,
    totalCost: roundCurrency(directCost + overheadCost),
    materialCost: roundCurrency(breakdown.materialCost * item.volume),
    laborCost: roundCurrency(breakdown.laborCost * item.volume),
  };
}

export function calculateRabTotals(items: CalculatedWorkItem[]) {
  return items.reduce(
    (totals, item) => {
      totals.directCost = roundCurrency(totals.directCost + item.directCost);
      totals.overheadCost = roundCurrency(totals.overheadCost + item.overheadCost);
      totals.totalCost = roundCurrency(totals.totalCost + item.totalCost);
      totals.materialCost = roundCurrency(totals.materialCost + item.materialCost);
      totals.laborCost = roundCurrency(totals.laborCost + item.laborCost);
      return totals;
    },
    {
      directCost: 0,
      overheadCost: 0,
      totalCost: 0,
      materialCost: 0,
      laborCost: 0,
    },
  );
}

export function formatIdr(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(roundCurrency(value));
}
