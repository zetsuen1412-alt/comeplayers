export type AllocationCheck = {
  orderQuantity: number;
  assignedQuantity: number;
  difference: number;
  matches: boolean;
  status: "match" | "under" | "over" | "invalid";
};

export function checkAllocationQuantity(orderQuantity: number, assignmentQuantities: number[]): AllocationCheck {
  const assignedQuantity = assignmentQuantities.reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
  const difference = assignedQuantity - orderQuantity;
  const matches = orderQuantity > 0 && Math.abs(difference) < 0.00000001;
  const status: AllocationCheck["status"] = orderQuantity <= 0
    ? "invalid"
    : matches
      ? "match"
      : difference > 0
        ? "over"
        : "under";
  return { orderQuantity, assignedQuantity, difference, matches, status };
}
