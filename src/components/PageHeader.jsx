export default function PageHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between border-b border-border bg-surface px-6 py-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">{title}</h1>
        {subtitle && <p className="text-sm text-ink/50">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
