import { ActionForm, type FormState } from "@/components/action-form";
import { removeEntry } from "@/server/profile/actions";
import type { EntryKind } from "@/server/profile/data";

type Save = (state: FormState, form: FormData) => Promise<FormState>;

interface Props<T> {
  title: string;
  /** What one entry is called, for the buttons. */
  noun: string;
  kind: EntryKind;
  items: T[];
  empty: string;
  save: Save;
  summary: (item: T) => React.ReactNode;
  fields: (item?: T) => React.ReactNode;
}

/** A list of entries, each opening into its edit form, with a form to add one. */
export function Entries<T extends { id: number }>(props: Props<T>) {
  const { title, noun, kind, items, empty, save, summary, fields } = props;
  const headingId = `${kind}-heading`;

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="font-display text-2xl">
        {title}
      </h2>
      {items.length === 0 && <p className="mt-2 text-muted">{empty}</p>}
      <ul className="mt-2 divide-y divide-line">
        {items.map((item) => (
          <li key={item.id}>
            <details>
              <summary className="cursor-pointer py-3 break-words">{summary(item)}</summary>
              <div className="flex flex-col gap-2 pb-4">
                <ActionForm action={save} submitLabel={`Save ${noun}`}>
                  <input type="hidden" name="id" value={item.id} />
                  {fields(item)}
                </ActionForm>
                <ActionForm
                  action={removeEntry}
                  submitLabel={`Delete ${noun}`}
                  confirm={`Delete this ${noun}? This cannot be undone.`}
                  quiet
                >
                  <input type="hidden" name="kind" value={kind} />
                  <input type="hidden" name="id" value={item.id} />
                </ActionForm>
              </div>
            </details>
          </li>
        ))}
      </ul>
      <details className="mt-2 rounded-lg border border-line bg-surface">
        <summary className="cursor-pointer px-4 py-3">Add {noun}</summary>
        <div className="px-4 pb-4">
          <ActionForm action={save} submitLabel={`Add ${noun}`} resetOnSave>
            {fields()}
          </ActionForm>
        </div>
      </details>
    </section>
  );
}
