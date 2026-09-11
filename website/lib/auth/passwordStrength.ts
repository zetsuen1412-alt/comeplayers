export type PasswordStrength = {
  score: 0 | 1 | 2 | 3 | 4;
  label: "Very weak" | "Weak" | "Fair" | "Strong" | "Very strong";
  checks: {
    minimumLength: boolean;
    mixedCase: boolean;
    number: boolean;
    symbol: boolean;
  };
};

export function getPasswordStrength(password: string): PasswordStrength {
  const checks = {
    minimumLength: password.length >= 8,
    mixedCase: /[a-z]/.test(password) && /[A-Z]/.test(password),
    number: /\d/.test(password),
    symbol: /[^A-Za-z0-9]/.test(password),
  };

  let points = Object.values(checks).filter(Boolean).length;

  if (password.length >= 12 && checks.minimumLength) {
    points += 1;
  }

  const score = Math.min(4, points) as PasswordStrength["score"];
  const labels: PasswordStrength["label"][] = [
    "Very weak",
    "Weak",
    "Fair",
    "Strong",
    "Very strong",
  ];

  return {
    score,
    label: labels[score],
    checks,
  };
}
