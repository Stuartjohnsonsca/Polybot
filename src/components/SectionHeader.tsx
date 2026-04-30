export default function SectionHeader({
  title,
  subtitle,
  count,
}: {
  title: string;
  subtitle?: string;
  count?: number;
}) {
  return (
    <div className="mb-5 flex items-end justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {typeof count === "number" && (
        <span className="text-xs text-muted">
          {count} event{count === 1 ? "" : "s"}
        </span>
      )}
    </div>
  );
}
