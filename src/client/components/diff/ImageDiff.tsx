// An image's change: before and after side by side, a swipe between them,
// or one faded over the other, on a checkerboard so transparency shows.

import { useState } from 'react';
import { formatSize } from '@hyperpane/sdk/client';
import { SegmentedControl, cn } from '@hyperpane/ui';
import type { Blob, Diff } from '../../../shared/index.ts';

type Mode = 'two' | 'swipe' | 'onion';

const CHECKER: React.CSSProperties = {
  backgroundColor: 'var(--node-bg)',
  backgroundImage:
    'linear-gradient(45deg, color-mix(in srgb, var(--node-fg) 8%, transparent) 25%, transparent 25%, transparent 75%, color-mix(in srgb, var(--node-fg) 8%, transparent) 75%), linear-gradient(45deg, color-mix(in srgb, var(--node-fg) 8%, transparent) 25%, transparent 25%, transparent 75%, color-mix(in srgb, var(--node-fg) 8%, transparent) 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0, 8px 8px',
};

const url = (mime: string, b: Blob | null) => (b?.data ? `data:${mime};base64,${b.data}` : null);

export function ImageDiff({ diff }: { diff: Diff }) {
  const image = diff.image!;
  const before = url(image.mime, image.before);
  const after = url(image.mime, image.after);
  const both = !!before && !!after;
  const [mode, setMode] = useState<Mode>('two');
  const [at, setAt] = useState(50);
  const [dims, setDims] = useState<{ before?: string; after?: string }>({});
  const size = (side: 'before' | 'after') => (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setDims((d) => ({ ...d, [side]: `${img.naturalWidth} × ${img.naturalHeight}` }));
  };
  const caption = (label: string, b: Blob | null, d?: string, color?: string) => (
    <div className="flex items-center gap-2 text-2xs text-[var(--node-muted)]">
      <span className="font-semibold" style={{ color }}>
        {label}
      </span>
      {b && <span>{formatSize(b.size)}</span>}
      {d && <span>{d}</span>}
      {b?.tooLarge && <span>Too big to show.</span>}
    </div>
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-3">
      {both && (
        <div className="flex justify-center">
          <SegmentedControl
            size="xs"
            label="How to compare"
            value={mode}
            onValueChange={(v) => setMode(v as Mode)}
            options={[
              { value: 'two', label: '2-up' },
              { value: 'swipe', label: 'Swipe' },
              { value: 'onion', label: 'Onion skin' },
            ]}
          />
        </div>
      )}
      {mode === 'two' || !both ? (
        <div className="flex min-h-0 flex-1 items-start justify-center gap-4">
          {(before || image.before) && (
            <figure className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
              <div className="rounded-control flex max-h-full items-center justify-center overflow-hidden border-2 border-[color-mix(in_srgb,var(--ansi-1)_60%,transparent)]" style={CHECKER}>
                {before && <img src={before} alt="Before" onLoad={size('before')} className="max-h-[60vh] max-w-full object-contain" />}
              </div>
              {caption('Before', image.before, dims.before, 'var(--ansi-1)')}
            </figure>
          )}
          {(after || image.after) && (
            <figure className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
              <div className="rounded-control flex max-h-full items-center justify-center overflow-hidden border-2 border-[color-mix(in_srgb,var(--ansi-2)_60%,transparent)]" style={CHECKER}>
                {after && <img src={after} alt="After" onLoad={size('after')} className="max-h-[60vh] max-w-full object-contain" />}
              </div>
              {caption('After', image.after, dims.after, 'var(--ansi-2)')}
            </figure>
          )}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center gap-2">
          <div className="rounded-control relative inline-block overflow-hidden" style={CHECKER}>
            <img src={after!} alt="After" className="block max-h-[56vh] max-w-full object-contain" />
            <img
              src={before!}
              alt="Before"
              className={cn('absolute inset-0 block h-full w-full object-contain')}
              style={mode === 'swipe' ? { clipPath: `inset(0 ${100 - at}% 0 0)` } : { opacity: 1 - at / 100 }}
            />
            {mode === 'swipe' && <div className="absolute inset-y-0 w-px bg-[var(--node-accent)]" style={{ left: `${at}%` }} />}
          </div>
          <input type="range" min={0} max={100} value={at} onChange={(e) => setAt(Number(e.target.value))} aria-label={mode === 'swipe' ? 'Where to divide' : 'How much of the old image'} className="w-60 accent-[var(--node-accent)]" />
          <div className="flex gap-6">
            {caption('Before', image.before, dims.before, 'var(--ansi-1)')}
            {caption('After', image.after, dims.after, 'var(--ansi-2)')}
          </div>
        </div>
      )}
    </div>
  );
}
