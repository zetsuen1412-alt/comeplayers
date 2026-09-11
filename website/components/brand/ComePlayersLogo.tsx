import Image from "next/image";

type ComePlayersLogoProps = {
  className?: string;
  compact?: boolean;
  size?: "sm" | "md" | "lg" | "header";
  tone?: "light" | "dark";
};

export default function ComePlayersLogo({
  className = "",
  compact = false,
  size = "md",
}: ComePlayersLogoProps) {
  const resolvedSize = compact && size === "md" ? "sm" : size;
  const logo = {
    sm: {
      width: 210,
      height: 65,
      className: "h-12 w-auto sm:h-14",
      priority: true,
    },
    md: {
      width: 260,
      height: 80,
      className: "h-16 w-auto md:h-20",
      priority: true,
    },
    lg: {
      width: 330,
      height: 102,
      className: "h-20 w-auto sm:h-24",
      priority: true,
    },
    header: {
      width: 260,
      height: 80,
      className: "h-12 w-auto sm:h-14 lg:h-20",
      priority: true,
    },
  }[resolvedSize];

  return (
    <span
      className={`inline-flex shrink-0 items-center ${
        compact ? "origin-left" : ""
      } ${className}`}
      role="img"
      aria-label="ComePlayers"
    >
      <Image
        src="/logo.png"
        alt=""
        width={logo.width}
        height={logo.height}
        priority={logo.priority}
        className={`${logo.className} object-contain drop-shadow-[0_12px_28px_rgba(0,0,0,0.55)]`}
      />
    </span>
  );
}
