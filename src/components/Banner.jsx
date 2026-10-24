export default function Banner({ kind = 'error', children }) {
  if (!children) return null
  const styles = {
    error: 'border-danger/30 bg-danger/5 text-danger',
    success: 'border-success/30 bg-success/5 text-success',
    info: 'border-border bg-bg text-ink/70'
  }
  return <div className={`mb-4 rounded-sm border px-3 py-2 text-sm ${styles[kind]}`}>{children}</div>
}
