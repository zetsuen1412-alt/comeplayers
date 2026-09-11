import Link from "next/link";

type BreadcrumbItem = {
  label: string;
  href?: string;
};

export default function MarketplaceBreadcrumbs({
  items,
  className = "",
}: {
  items: BreadcrumbItem[];
  className?: string;
}) {
  const visibleItems = items.filter((item) => item.label?.trim());

  if (visibleItems.length === 0) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className={`flex flex-wrap items-center gap-2 text-sm font-bold text-slate-300 ${className}`}
    >
      {visibleItems.map((item, index) => {
        const isLast = index === visibleItems.length - 1;

        return (
          <span key={`${item.label}-${index}`} className="inline-flex items-center gap-2">
            {index > 0 ? <span className="text-slate-600">/</span> : null}

            {item.href && !isLast ? (
              <Link href={item.href} className="text-cyan-300 hover:text-cyan-200 hover:underline">
                {item.label}
              </Link>
            ) : (
              <span className={isLast ? "text-white" : "text-slate-300"}>{item.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
