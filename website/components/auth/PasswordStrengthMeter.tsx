import { getPasswordStrength } from "@/lib/auth/passwordStrength";

export default function PasswordStrengthMeter({ password }: { password: string }) {
  const strength = getPasswordStrength(password);
  const activeClasses = [
    "bg-rose-500",
    "bg-orange-400",
    "bg-amber-300",
    "bg-cyan-400",
    "bg-emerald-400",
  ];

  return (
    <div className="grid gap-2" aria-live="polite">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-slate-400">Password strength</span>
        <span className="font-bold text-slate-200">{strength.label}</span>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {[1, 2, 3, 4].map((level) => (
          <span
            key={level}
            className={`h-1.5 rounded-full ${
              strength.score >= level
                ? activeClasses[strength.score]
                : "bg-slate-700"
            }`}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-400">
        <span className={strength.checks.minimumLength ? "text-emerald-300" : ""}>
          {strength.checks.minimumLength ? "✓" : "○"} 8+ characters
        </span>
        <span className={strength.checks.mixedCase ? "text-emerald-300" : ""}>
          {strength.checks.mixedCase ? "✓" : "○"} Upper & lowercase
        </span>
        <span className={strength.checks.number ? "text-emerald-300" : ""}>
          {strength.checks.number ? "✓" : "○"} One number
        </span>
        <span className={strength.checks.symbol ? "text-emerald-300" : ""}>
          {strength.checks.symbol ? "✓" : "○"} One symbol
        </span>
      </div>
    </div>
  );
}
