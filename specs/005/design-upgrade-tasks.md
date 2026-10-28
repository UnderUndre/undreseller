# Design Review & Web UI Polish Tasks: 005 Frontend Upgrade

> Standards Source: `ai-design-skills` (`landing-page-design` & `redesign-existing-projects`).
> Focus: Eliminate generic AI slop, audit action hierarchy, remove emojis, consolidate picklists, and implement robust theme switching.

---

## 1. Architectural & UX Diagnosis

| Area | Slop / Anti-pattern | High-Standard Upgrade |
|---|---|---|
| **Header Nav** | Competing CTAs: separate "catalog" and "book slot" links confusing primary user intent. | Single clear navigation hierarchy: clean "Services" section link + one prominent, high-contrast primary CTA button ("Book Slot" / "Записаться"). |
| **Iconography** | Generic OS emojis (`🛡️`, `⭐`) in brand header and buttons. | Zero emojis. Replace with precision vector SVGs (clean geometry, 1.5–2px stroke, Phosphor/Solar style) or pure typography. |
| **Language** | Segmented inline toggle buttons (`[ru] [en]`) cluttering the header. | Single trigger button with current language label + chevron, opening an accessible dropdown picklist with active indicators and click-outside dismissal. |
| **Theming** | No user control over theme in desktop web browser (TMA-only dark mode hook). | Full Theme Selector (System, Light, Dark) with localStorage persistence, system media query listener, and inline anti-FOUC script. |
| **Typography** | Hardcoded `font-family: Arial, Helvetica` fallback in `globals.css` ignoring Geist tokens. | Pure Geist / modern system font stack (`var(--font-geist-sans)`), strict Tailwind type scale, `text-wrap: balance` on headings. |
| **Button States** | Flat transitions without active press feedback or optical padding. | Spring-like micro-interactions (`active:scale-[0.98]`), `focus-visible` rings, semibold font weights (`text-sm` for header, `text-base` for primary). |

---

## 2. Actionable Task Breakdown

### DT-001: Header Navigation & Action Hierarchy Redesign
- [x] Analyze storefront header in `app/layout.tsx`.
- [x] Replace duplicate "catalog" + "book slot" text links with unified navigation structure:
  - Left: Brand icon (clean SVG shield) + Title link to `/`.
  - Right: "Services" link + one dedicated, styled Primary CTA button (`/book`) + ThemeSwitcher + LocaleSwitcher.

### DT-002: Emoji Purge & Vector Iconography
- [x] Remove `<span>🛡️</span>` emoji from `app/layout.tsx`.
- [x] Replace with inline scalable SVG shield icon with subtle brand tint.
- [x] Audit cards, badges and buttons across `components/catalog` and `app/page.tsx` for rogue emojis.

### DT-003: Single-Button Dropdown Locale Picklist (`LocaleSwitcher.tsx`)
- [x] Refactor `components/LocaleSwitcher.tsx` from dual-button group into a single compact dropdown button.
- [x] Display current locale code with SVG chevron icon.
- [x] On click, toggle a floating picklist menu with supported locales (`English`, `Русский`, `Українська`).
- [x] Add active state indicator (check icon), keyboard navigation (`Escape` closes), and click-outside event listener.

### DT-004: Theme Switcher Component (`ThemeSwitcher.tsx`)
- [x] Create `components/ThemeSwitcher.tsx` supporting `system` | `light` | `dark`.
- [x] Implement smooth icon transitions (Sun, Moon, Monitor).
- [x] Persist selection in `localStorage` under `undrlla_theme`.
- [x] Add SSR hydration script to `app/layout.tsx` `<head>` to prevent flash of unstyled theme (FOUC).

### DT-005: Typography & Interactive Micro-Interactions (`globals.css`)
- [x] Clean up `app/globals.css`: remove `Arial, Helvetica` override, enforce Geist font variables.
- [x] Ensure all buttons have explicit `active:scale-[0.98]` physical feedback and smooth transitions.
- [x] Apply `text-wrap: balance` for headings and `text-wrap: pretty` for body paragraphs.
