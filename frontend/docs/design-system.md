# MomentOS Design System (v1)

This is the shared UI contract for frontend screens.

## 1) Foundations

- Typography
  - Body: `Inter`
  - Display: `Space Grotesk` (for major headings)
- Color intent
  - Brand action: `brand-600`
  - Neutral text: `ink-900` / `ink-700`
  - Surface: `white`, muted surface `ink-50`
  - Border: `ink-200`
  - Danger: `danger-600`
- Radius
  - Standard: `rounded-ds`
  - Elevated card/modal: `rounded-ds-lg`
- Shadow
  - Base container: `shadow-ds`
  - Popover/menu: `shadow-popover`

Source of truth:
- Tailwind theme: `frontend/tailwind.config.js`
- Typed tokens: `frontend/src/design-system/tokens.ts`

## 2) Core CSS Primitives

Global component classes are defined in `frontend/src/index.css`:

- Layout/surfaces
  - `ds-page`
  - `ds-surface`
  - `ds-card`
  - `ds-card-header`
  - `ds-card-body`
- Form controls
  - `ds-label`
  - `ds-input`
  - `ds-select`
  - `ds-textarea`
- Buttons/links
  - `ds-btn` + size: `ds-btn-sm` | `ds-btn-md`
  - Variants: `ds-btn-primary` | `ds-btn-secondary` | `ds-btn-danger` | `ds-btn-ghost`
  - Link action: `ds-link`
- Feedback
  - `ds-alert`
  - `ds-alert-success` | `ds-alert-error` | `ds-alert-info`
- Navigation
  - `ds-tablist`
  - `ds-tab` | `ds-tab-active`
- Data display
  - `ds-table-wrap`
  - `ds-table`
  - `ds-th`
  - `ds-td`
- Modal
  - `ds-modal-shell`
  - `ds-modal-backdrop`
  - `ds-modal-position`
  - `ds-modal-panel`
  - `ds-modal-header`
- Row action/dropdown
  - `ds-icon-trigger`
  - `ds-dropdown`
  - `ds-dropdown-item`
- Upload control
  - `ds-file-input`

## 3) React UI Primitives

Reusable components live in `frontend/src/components/ui`:

- `Button`
  - Props: `variant`, `size`, `fullWidth`
- `Card`, `CardHeader`, `CardBody`
- `Input`
- `Select`
- `cn` helper

Auth wrapper:
- `frontend/src/components/auth/AuthContainer.tsx`

Import pattern:

```ts
import { Button, Card, CardBody, CardHeader, Input, Select } from '../components/ui';
```

## 4) Usage Rules

- Use `Button` over inline button class strings.
- Use `ds-input` / `Input` for all text/date/email form controls.
- Use `Card` wrappers for main panels instead of ad-hoc `bg-white rounded shadow` combos.
- Use dropdown and modal primitives instead of custom one-off styling.
- New tables should start with `ds-table-wrap` + `ds-table` + `ds-th` + `ds-td`.

## 5) Migration Strategy

1. Replace repeated Tailwind button/input/modal class strings first.
2. Move each page to `Card`/`Button` primitives.
3. Remove old one-off classes only after all usages are migrated.

Current first adopter:
- `frontend/src/components/people/PeopleList.tsx`
