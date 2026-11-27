/** A section that has a place in the app but no content yet. */
export function EmptyPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="max-w-prose">
      <h1 className="font-display text-3xl">{title}</h1>
      <p className="mt-3 text-muted">{children}</p>
    </div>
  );
}
