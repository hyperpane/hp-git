// The window's navigation: a rail down the left (Changes, History, Branches,
// Stashes, Tags), each with its icon, its name and a count. Open, 184px;
// collapsed, 52px of icons with the counts as badges and the names in
// tooltips. The width animates; the icons don't move, the names and counts
// fade. Its foot folds it (⌘\) and hides the list beside it (⇧⌘\).
//
// Narrow (a phone), the same views as a bar along the bottom (BottomNav).

import { useRef } from 'react';
import { type Icon as IconComponent, LayoutPanelLeft, PanelLeftClose, PanelLeftOpen } from '@hyperpane/icons';
import { keys } from '@hyperpane/sdk/client';
import { Tooltip, cn, styles, useRovingFocus } from '@hyperpane/ui';
import type { Tab } from '../../app/repo.ts';

export interface NavItem {
  value: Tab;
  label: string;
  icon: IconComponent;
  count?: number;
  /** The count needs a look (conflicts). */
  alert?: boolean;
  /** Its key, as the Mac writes it (⌃1). */
  shortcut: string;
}

const countText = (n: number) => (n > 999 ? '999+' : String(n));
/** A badge's count: two digits at most. */
const badgeText = (n: number) => (n > 99 ? '99+' : String(n));

/** The rail: the views, then, at its foot, fold it and hide the list. */
export function Rail({
  items,
  value,
  onChange,
  collapsed,
  onCollapse,
  list,
  onList,
  dimmed,
}: {
  items: NavItem[];
  value: Tab;
  onChange(t: Tab): void;
  collapsed: boolean;
  onCollapse(): void;
  /** Whether the list beside it shows. */
  list: boolean;
  onList(): void;
  /** A view is open over the tabs: the picked one is quieter. */
  dimmed?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onKeyDown = useRovingFocus(ref, {
    selector: '[role=tab]',
    orientation: 'vertical',
    typeahead: false,
    onMove: (el) => onChange(el.dataset.value as Tab),
  });
  return (
    <nav
      aria-label="Views"
      data-rail={collapsed ? 'collapsed' : 'open'}
      className="flex flex-none flex-col overflow-hidden bg-[var(--git-rail)] transition-[width] duration-[var(--git-move)] ease-[var(--git-ease)]"
      style={{ width: collapsed ? 'var(--git-rail-closed)' : 'var(--git-rail-open)' }}
    >
      <div ref={ref} role="tablist" aria-orientation="vertical" aria-label="Views" onKeyDown={onKeyDown} className="flex flex-col gap-0.5 p-2">
        {items.map((t) => {
          const on = t.value === value;
          const Icon = t.icon;
          return (
            <Tipped key={t.value} on={collapsed} content={<Tip label={t.label} shortcut={t.shortcut} count={t.count} />}>
              <button
                type="button"
                role="tab"
                aria-selected={on}
                tabIndex={on ? 0 : -1}
                data-value={t.value}
                onClick={() => onChange(t.value)}
                className={cn(
                  'relative flex h-8 w-full flex-none items-center gap-2.5 overflow-hidden rounded-control px-2.5 text-[13px] whitespace-nowrap transition-colors duration-100 touch:h-10',
                  styles.focusRingInset,
                  on
                    ? cn('font-medium text-[var(--node-fg)]', dimmed ? 'bg-[var(--node-hover)]' : 'bg-[var(--git-selected-quiet)]')
                    : 'text-[var(--node-muted)] hover:bg-[var(--node-hover)] hover:text-[var(--node-fg)]',
                )}
              >
                <Icon aria-hidden className={cn('size-4 flex-none transition-colors duration-100', on && !dimmed && 'text-[var(--node-accent)]')} />
                <Fading shown={!collapsed} className="min-w-0 flex-1 truncate text-start">
                  {t.label}
                </Fading>
                {!!t.count && (
                  <Fading
                    shown={!collapsed}
                    className={cn(
                      'flex-none text-xs tabular-nums',
                      t.alert ? 'font-semibold text-[var(--git-conflicted)]' : on ? 'text-[var(--node-fg)] opacity-70' : 'text-[var(--node-muted)]',
                    )}
                  >
                    {countText(t.count)}
                  </Fading>
                )}
                {/* Folded, the count as a badge over the icon's top-right
                    corner. Anchored by its right edge 2px inside the
                    item's tile (36px in the 52px rail), so it grows to the
                    left over the icon as digits come and is never cut by
                    the tile's edge or the rail's. The ring, in the rail's
                    colour, lifts it off the picked tile. */}
                {!!t.count && (
                  <span
                    aria-hidden
                    data-badge
                    className={cn(
                      'pointer-events-none absolute end-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-semibold tracking-[-0.02em] text-white tabular-nums ring-2 ring-[var(--git-rail)] transition-[opacity,scale] duration-150',
                      t.alert ? 'bg-[var(--git-conflicted)]' : 'bg-[var(--node-accent)]',
                      collapsed ? 'scale-100 opacity-100 delay-200' : 'scale-50 opacity-0',
                    )}
                  >
                    {badgeText(t.count)}
                  </span>
                )}
              </button>
            </Tipped>
          );
        })}
      </div>
      <div className="flex-1" />
      <div className="flex flex-col gap-0.5 p-2">
        <FootButton
          icon={LayoutPanelLeft}
          label={list ? 'Hide the list' : 'Show the list'}
          text={list ? 'Hide list' : 'Show list'}
          shortcut="⇧⌘\"
          collapsed={collapsed}
          pressed={!list}
          onClick={onList}
        />
        <FootButton
          icon={collapsed ? PanelLeftOpen : PanelLeftClose}
          label={collapsed ? 'Expand the sidebar' : 'Collapse the sidebar'}
          text="Collapse"
          shortcut="⌘\"
          collapsed={collapsed}
          onClick={onCollapse}
        />
      </div>
    </nav>
  );
}

/** What fades out as the rail folds (a name, a count), and back in once it
 * has opened. */
function Fading({ shown, className, children }: { shown: boolean; className?: string; children: React.ReactNode }) {
  return (
    <span aria-hidden={!shown || undefined} className={cn('transition-opacity', shown ? 'opacity-100 duration-200 delay-100' : 'opacity-0 duration-75', className)}>
      {children}
    </span>
  );
}

/** A tooltip only while `on` (the rail folded: the names are hidden). The
 * button stays the same element either way, so its focus survives. */
function Tipped({ on, content, children }: { on: boolean; content: React.ReactNode; children: React.ReactElement<Record<string, unknown>> }) {
  return (
    <Tooltip side="right" content={content} className={on ? undefined : 'hidden'}>
      {children}
    </Tooltip>
  );
}

function Tip({ label, shortcut, count }: { label: string; shortcut?: string; count?: number }) {
  return (
    <span className="flex items-center gap-2">
      <span>{label}</span>
      {!!count && <span className="tabular-nums opacity-70">{count}</span>}
      {shortcut && <span className="font-normal opacity-60">{keys(shortcut)}</span>}
    </span>
  );
}

function FootButton({
  icon: Icon,
  label,
  text,
  shortcut,
  collapsed,
  pressed,
  onClick,
}: {
  icon: IconComponent;
  label: string;
  text: string;
  shortcut: string;
  collapsed: boolean;
  pressed?: boolean;
  onClick(): void;
}) {
  return (
    <Tipped on={collapsed} content={<Tip label={label} shortcut={shortcut} />}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        onClick={onClick}
        className={cn(
          'flex h-8 w-full flex-none items-center gap-2.5 rounded-control px-2.5 text-[13px] whitespace-nowrap text-[var(--node-muted)] transition-colors duration-100 hover:bg-[var(--node-hover)] hover:text-[var(--node-fg)] active:bg-[var(--node-active)] touch:h-10',
          styles.focusRing,
        )}
      >
        <Icon aria-hidden className="size-4 flex-none" />
        <Fading shown={!collapsed} className="min-w-0 flex-1 truncate text-start">
          {text}
        </Fading>
        <Fading shown={!collapsed} className="flex-none text-[11px] opacity-60">
          {keys(shortcut)}
        </Fading>
      </button>
    </Tipped>
  );
}

/** Narrow: the views along the bottom, an icon over each name, the picked
 * one's icon in a soft pill. */
export function BottomNav({ items, value, onChange }: { items: NavItem[]; value: Tab; onChange(t: Tab): void }) {
  const ref = useRef<HTMLDivElement>(null);
  const onKeyDown = useRovingFocus(ref, {
    selector: '[role=tab]',
    orientation: 'horizontal',
    typeahead: false,
    onMove: (el) => onChange(el.dataset.value as Tab),
  });
  return (
    <div
      ref={ref}
      role="tablist"
      aria-label="Views"
      onKeyDown={onKeyDown}
      data-rail="bottom"
      className="flex h-14 flex-none items-stretch border-t border-[var(--git-line)] bg-[var(--git-rail)] px-1 pb-[env(safe-area-inset-bottom)] touch:h-16"
    >
      {items.map((t) => {
        const on = t.value === value;
        const Icon = t.icon;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            data-value={t.value}
            title={t.label}
            onClick={() => onChange(t.value)}
            className={cn(
              'flex min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[11px] leading-none transition-colors duration-100',
              styles.focusRingInset,
              on ? 'font-medium text-[var(--node-fg)]' : 'text-[var(--node-muted)] hover:text-[var(--node-fg)]',
            )}
          >
            <span className={cn('relative flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-150', on && 'bg-[var(--git-selected)]')}>
              <Icon aria-hidden className={cn('size-4', on && 'text-[var(--node-accent)]')} />
              {!!t.count && (
                <span
                  className={cn(
                    'absolute end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-semibold tracking-[-0.02em] text-white tabular-nums ring-2 ring-[var(--git-rail)]',
                    t.alert ? 'bg-[var(--git-conflicted)]' : 'bg-[var(--node-accent)]',
                  )}
                >
                  {badgeText(t.count)}
                </span>
              )}
            </span>
            <span className="max-w-full truncate px-0.5">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
