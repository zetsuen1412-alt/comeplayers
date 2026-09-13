export function slaHealth(args: {
  progressPercent: number;
  elapsedPercent: number;
  overdue: boolean;
}): "on_track" | "at_risk" | "overdue" {
  if (args.overdue) return "overdue";
  if (args.elapsedPercent >= 70 && args.progressPercent + 20 < args.elapsedPercent) return "at_risk";
  return "on_track";
}
