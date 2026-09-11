import Link from "next/link";

export default function ComePlayersLogoHomeLink() {
  return (
    <Link
      href="/"
      aria-label="Go to ComePlayers home"
      className="flex cursor-pointer items-center"
    >
      <img
        src="/logo.png?v=2"
        alt="ComePlayers"
        className="h-16 w-auto object-contain md:h-20"
      />
    </Link>
  );
}
