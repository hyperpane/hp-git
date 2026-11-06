// What every dialog of the window is made of: a form as tall as what's in
// it (Escape cancels), with Cancel and its button; and a checkbox with a
// hint.

import { type FormEvent, type ReactNode, useEffect, useRef } from 'react';
import { useHost } from '@hyperpane/sdk/client';
import { Button, DialogFooter } from '@hyperpane/ui';

export function Form({ children, onSubmit, ok, disabled, danger }: { children: ReactNode; onSubmit(): void; ok: string; disabled?: boolean; danger?: boolean }) {
  const host = useHost();
  const box = useRef<HTMLFormElement>(null);
  // As tall as what's in it.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => host.ui.size({ height: Math.ceil(el.scrollHeight) });
    fit();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [host]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!disabled) onSubmit();
  };
  return (
    <form ref={box} onSubmit={submit} className="text-foreground flex flex-col text-sm" onKeyDown={(e) => e.key === 'Escape' && host.ui.closeDialog(null)}>
      <div className="flex flex-col gap-4 px-5 pt-1 pb-5">{children}</div>
      {/* A row, as the app's own dialogs have it (the frame is narrower than their breakpoint). */}
      <DialogFooter className="flex-row justify-end">
        <Button type="button" variant="secondary" onClick={() => host.ui.closeDialog(null)}>
          Cancel
        </Button>
        <Button type="submit" disabled={disabled} color={danger ? 'destructive' : undefined}>
          {ok}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function Check({ checked, onChange, children, hint }: { checked: boolean; onChange(v: boolean): void; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="flex cursor-default items-start gap-2 select-none">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-primary mt-0.5 size-4" />
      <span className="flex flex-col gap-0.5">
        <span>{children}</span>
        {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
      </span>
    </label>
  );
}
