const control = "w-full min-w-0 rounded-lg border border-line-strong bg-background px-3 py-2";

function Label({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-sm text-muted">
      {label}
      <span className="text-base text-foreground">{children}</span>
    </label>
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { label: string };

export function Input({ label, ...props }: InputProps) {
  return (
    <Label label={label}>
      <input {...props} className={control} />
    </Label>
  );
}

export function TextArea({
  label,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return (
    <Label label={label}>
      <textarea rows={3} {...props} className={control} />
    </Label>
  );
}

export function Select({
  label,
  options,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  options: readonly string[];
}) {
  return (
    <Label label={label}>
      <select {...props} className={`${control} capitalize`}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </Label>
  );
}

export function Row({ children }: { children: React.ReactNode }) {
  // Fields share the width, wrapping when they would get narrower than this.
  return <div className="flex flex-wrap items-end gap-3 *:flex-1 *:basis-40">{children}</div>;
}
