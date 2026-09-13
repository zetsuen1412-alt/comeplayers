export function PageHeader({ title, description, eyebrow }: { title: string; description: string; eyebrow?: string }) {
  return (
    <div className="mb-6">
      {eyebrow ? <div className="mb-2 text-sm font-medium text-yellow-300">{eyebrow}</div> : null}
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-2 max-w-3xl text-base leading-7 text-zinc-400">{description}</p>
    </div>
  );
}
