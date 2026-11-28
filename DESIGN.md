# The Git window's design

Fresh, refined, dense but airy: Linear, Raycast, Arc. Not GitHub Desktop:
no stacked captions, no hard bars, no boxes around everything. Spacing
separates first; a hairline only where spacing can't.

The code: tokens in `src/client/ui/tokens.ts` (CSS variables, added once per
frame), patterns as class strings in `src/client/ui/classes.ts`, small parts
in `src/client/ui/parts.tsx` (`Button`, `Chip`, `Dot`, `CountText`,
`STATUS_COLOR`). Use them; don't spell out sizes and states again.

## Scale

| | Value | Tailwind |
|---|---|---|
| Body text | 13px / 20px | `text-[13px] leading-5` (the window's root) |
| Small text (meta, counts, secondary lines) | 12px | `text-xs` |
| Labels (section headers) | 11px, uppercase, 0.06em, medium, muted, sparingly | `text.label`, `section.header` |
| Code, SHAs | 12px mono | `text.mono` |
| Row | 32px; compact 28px; two-line 44px | `row.base`, `row.compact`, `h-11` |
| Top bar | 44px, controls 28px | |
| Icons | 16px; 14px in dense rows and small buttons | `icon.base`, `icon.dense` |
| Spacing | 4 / 8 / 12 / 16 / 24 | `1`, `2`, `3`, `4`, `6` |
| Radii | full for every one-line control (buttons, fields, chips, segmented controls); 8 rows; 12 cards and popovers | `rounded-full`, `rounded-control`, `rounded-surface` |
| Motion | 100ms hover/press, 150ms appear, 220ms move (`--git-move`, `--git-ease`) | off under reduced motion |

A list sits 6px in from its pane's edges (`row.list`: `px-1.5`), rows 8px
padded inside, so a row's pill never touches the edge.

## Colours

Only theme variables, so every theme works, light and dark:

- Window: `--node-bg`, `--node-fg`, `--node-muted`, `--node-accent`,
  `--node-hover`, `--node-active`, `--node-border` (prefer `--git-line`).
- Ours (tokens.ts):
  - `--git-rail` the rail's surface; `--git-raised` cards, raised fields.
  - `--git-line` hairlines (8% of the text colour).
  - `--git-fill` / `--git-fill-hover` / `--git-fill-active` quiet controls.
  - `--git-selected` / `--git-selected-hover` a picked row (accent 16%);
    `--git-selected-quiet` the rail's pick and a list without the keys.
  - Status: `--git-added` (green), `--git-modified` (amber), `--git-deleted`
    (red), `--git-renamed` (blue), `--git-copied` (cyan), `--git-conflicted`
    (orange, between red and amber), `--git-ignored` (muted). One colour per
    kind everywhere: letters, dots, counts, banners. Tint, don't fill:
    `color-mix(in srgb, var(--git-added) 14%, transparent)` behind, the
    colour itself for the glyph.
- Never hard-code a hex colour; `text-white` only on the accent.

## Patterns

- **List row**: `row.base` (32px, 8px corners, hover `--node-hover`), icon
  16px (14px when dense), name in 13px, meta (path, time) in 12px muted, the
  numbers `tabular-nums` at the end. Actions appear on hover
  (`group-hover/row:`), not always.
- **Selected row**: `row.selected`, a soft accent pill. No left bar, no
  solid accent fill, no border. `row.selectedQuiet` when the list hasn't the
  keys.
- **Section header**: `section.header` / `components/SectionHeader.tsx`:
  11px uppercase muted label, its count after it, actions at the end, 28px,
  no line under it; a chevron when it folds.
- **Switcher**: `switcher.*`, the top bar's one pill for where you are:
  two halves (folder + repository ⌄, branch + ↑n ↓n ⌄), each its own
  button with its own hover clipped to its half and its own menu, a
  hairline between them (no "/"). `switcher.open` while the branch list is
  open. The sync button is built the same way: accent when something
  waits (Pull, Push, Publish), else quiet (no fill, muted) for Fetch and
  Add remote.
- **Chip**: `Chip` (20px, 6px corners, 11px medium): a ref, a tag, a state,
  ahead/behind. Pass `color` (a status token or the accent) to tint it.
- **Buttons** (`Button`, or `button.*`): `primary` the accent, one per
  place (Commit, Continue); `secondary` a soft fill (most); `ghost` text
  until hovered (toolbars, Abort, Cancel); `danger` a red tint, solid red
  only in a confirm. 28px, `lg` 32px, `iconOnly` square (with an
  aria-label). The kit's `ToolButton` is fine for icon tools in a pane bar.
- **Segmented control**: the kit's `SegmentedControl` (`size="xs"` or
  `"sm"`) for a value (Unified/Split, a filter's field); the rail and the
  bottom bar for the views. Not tabs with an underline.
- **Field**: `field` (28px, soft fill, accent ring on focus); with an icon,
  `ps-8` and the icon at `left-2.5`.
- **Empty state**: `components/Blank.tsx`: the kit's 44px `IconTile` with a 20px icon,
  a 13px title, a 12px muted line, then actions (one primary at most).
- **Card**: `card`, raised surface, no line (its fill sets it apart), 12px corners: a commit's
  header, a conflict block, a banner.
- **Banner**: like `views/OperationBar.tsx`: a card tinted in a status
  colour, a round icon tile, title and a muted line, actions at the end.
- **Divider**: `divider.x` / `divider.y`, only where spacing can't separate
  (between list and detail the split's own line already does).

## Icons

`@hyperpane/icons`. Filled is the default (navigation, status, primary
actions). `variant="outline"` where a lighter weight fits: secondary icons
in dense rows, the non-current branches in a picker, decorative ones.

## The shell (stage 1)

- `app/Main.tsx`: top bar, operation banner, then rail + list + detail; in a
  narrow window (under 640px) the list and the detail one at a time and the
  views in a bottom bar.
- `views/shell/TopBar.tsx`: the switcher (repository | branch, with ↑n ↓n),
  the fetch error, `SyncButton.tsx` (Fetch quiet; Pull, Push, Publish in the
  accent; a spinner, progress line and cancel while busy).
- `views/shell/Rail.tsx`: `Rail` (184px open, 52px folded; width animates,
  icons stay put, names and counts fade, counts become badges, tooltips
  when folded) and `BottomNav`. Its foot: hide the list (⇧⌘\), fold (⌘\).
  Both kept in `local` (`sidebar`, `rail.folded`).
- `views/shell/BranchPicker.tsx`: the branch popover.
- The rail and bottom bar keep `role="tab"`, `data-value` and
  `aria-selected` (tests and keys rely on them).

## For the views (stage 2)

- The list column starts right under the top bar now (no tab row above it):
  its own header (filter, actions) is its first row, 44px tall with 8px
  padding, so its line meets the detail's header (also 44px).
- Lists should use `row.base`/`row.selected` and sit in `row.list`.
- Detail headers: 44px, title 13px medium, meta 12px muted, tools as
  `ToolButton` or ghost `Button`s; no `--node-header` fill (it reads as a
  bar), a `--git-line` under it at most.

## The views (stage 2)

- Pane headers: `header.base` (44px, a `--git-line` under it), `header.title`,
  `header.meta`. Every list's first row and every detail's first bar uses
  it, so their lines meet across the split (Changes, History, Branches,
  Stashes, Tags, a commit's files and its diff, file history, the overlay
  bar, a conflict's bar).
- Lists: `rowClass(picked)` in `ROW_INSET` (`lib/rows.ts`), 32px rows
  (`ROW_H`); two-line rows `ROW_H_TALL` (46, a 44px pill) in
  `ROW_INSET_TALL`, with a 28px icon tile tinted in the kind's colour.
  Foot counts: `footer`.
- Parts added: `SearchField` (the filter fields, with a clear button),
  `Stat` (+n −n, plain or as chips), `Kbd` (⌘↵ in a button).
- Status letters, refs, ahead/behind, conflicts' sides: the `--git-*`
  tokens (`--git-branch`, `--git-remote`, `--git-tag`, `--git-stash`,
  `--git-ours`, `--git-theirs`). Diff tints: `--git-diff-*`.
- The commit box is a composer card: the summary (with what's left of 72
  past 50), the description, then Amend / Sign off toggles, co-author and
  who commits (the avatar) in its foot; under it the one primary button
  with ⌘↵. A primary button greys when disabled, never a dim accent.
- Diffs: the header has the path (folder muted), +/− chips and a
  Unified/Split segmented control; hunk headers and folded lines are quiet
  `--git-diff-bar` bars; a hunk's box is a small checkbox. Every row of a
  diff, blame and a conflict's text is `ROW` (22px, `components/diff/theme.ts`):
  the virtual lists need one fixed height. Discard hunk is muted until
  hovered (red then).
- File rows: the checkbox in the accent (`ROW_CHECK`, as the hunk boxes),
  the status as a plain coloured letter (`StatusLetter plain`); the tile
  only in a diff's header. Changes has no section header while it's the
  only section (the rail and the filter already count it).
- The window's title is the repository; its subtitle (`setDescription`) the
  branch with ↑n ↓n (or "detached at abc1234") · the path, ~ for home.
- The folded rail's counts: a 16px pill anchored 2px inside the item's
  tile, over the icon's top-right corner, "99+" past 99, ringed in
  `--git-rail`.
