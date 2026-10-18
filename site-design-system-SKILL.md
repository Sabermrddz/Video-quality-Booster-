---
name: site-design-system
description: Use this skill whenever building or editing ANY page of this product — the public marketing site (home, pricing, features, FAQ), auth/onboarding flows (login, signup wizard), and the authenticated dashboard app (nav, tables, forms, charts, settings). This is the project's complete, fixed visual identity end to end. Apply it BEFORE writing any page or component, and follow it exactly rather than falling back on default UI-library styling.
---

# Full Site Design System

Reference direction: modeled directly on dentdz.com's real marketing site, signup flow, and dashboard product, plus dashboard-structure ideas borrowed from AdminKit Pro / Material Admin Pro and marketing-component ideas borrowed from other reference sites. This file covers the entire site — public pages, auth/onboarding, and the app — not the dashboard alone; every section below is one part of the same product and shares the same foundations.

## Foundations — shared everywhere on the site

### Color tokens

Light theme. Multi-color, not mono-blue: blue is the brand color, but status/category colors are used freely for badges, avatars, chart series and tags — this is a real trait of the reference product.

| Token | Hex | Role |
|---|---|---|
| `--bg` | `#FFFFFF` | Page/app background |
| `--surface` | `#F8FAFC` | Sidebar background, table zebra rows, subtle panels |
| `--border` | `#E4E9F1` | Card borders, dividers |
| `--text-primary` | `#111827` | Headings, primary text |
| `--text-secondary` | `#5B6472` | Secondary text, labels, table meta |
| `--text-muted` | `#94A0B2` | Placeholder, disabled |
| `--primary` | `#2563EB` | Brand blue — primary buttons, links, active nav, chart line, focus ring |
| `--primary-hover` | `#1D4ED8` | Primary hover/active |
| `--primary-tint` | `#EAF1FF` | Active nav background, selected rows, icon-circle backgrounds |
| `--success` | `#16A34A` | Positive stats, "completed" status, income |
| `--success-tint` | `#E7F8ED` | Success badge background |
| `--danger` | `#DC2626` | Negative stats, "cancelled" status, expenses |
| `--danger-tint` | `#FDECEC` | Danger badge background |
| `--warning` | `#F59E0B` | Ratings, "trial"/highlight badges, pending states |
| `--warning-tint` | `#FEF6E7` | Warning badge background |
| `--accent-violet` | `#7C3AED` | "Pro"/premium tags, step-indicator accents, upsell — never core UI chrome |
| `--accent-violet-tint` | `#F3EBFE` | Pro badge / active-step background |

Rules:
- `--primary` (blue) always dominates. Success/danger/warning/violet only appear for their specific semantic meaning (a status, a metric direction, a plan tier, a wizard step), never as general decoration.
- Avatars/initials get a color from a small rotating set (blue, danger, violet, success) keyed by user id.

### Typography

One friendly, rounded sans everywhere, no serif, strong Arabic + Latin support (the product is bilingual):

- **Single family**: `"Cairo"` or `"IBM Plex Sans Arabic"` paired with its Latin companion. Hierarchy via weight only — 700 headings, 600 buttons/labels, 400–500 body.
- Avoid Inter/Poppins/Tajawal-default.

Type scale (px / line-height / weight):
- Page title: 24–28 / 1.3 / 700
- Section header: 18–20 / 1.35 / 600
- Body / table text: 14 / 1.5 / 400–500
- Label / meta / caption: 12–13 / 1.4 / 500, `--text-secondary`

Sentence case everywhere, including buttons, nav items, and marketing headlines. Small all-caps only for compact pill eyebrow labels (see Marketing Site), never tracked more than 0.04em.

### Shape language

- Cards, panels, modals, inputs, auth form cards: `border-radius: 12px` (pricing cards can go to 16px).
- Buttons: `border-radius: 8px`.
- Status badges, tags, chips, plan ribbons: fully pill-shaped (`9999px`).
- Avatars, step-indicator circles, icon-circles: fully round.

### Elevation

Soft, quiet shadows are part of this identity:
- Default card: `1px solid var(--border)` + `0 1px 3px rgba(17,24,39,.06), 0 1px 2px rgba(17,24,39,.04)`.
- Elevated surfaces (dropdowns, modals, popovers, toasts): one stronger shadow, `0 8px 24px rgba(17,24,39,.12)`.
- Never stack a heavy shadow with a heavy border on the same element — pick one dominant depth cue.

### Signature texture

A very light blue dot-grid pattern behind public/marketing content and the auth/onboarding side panel — this is a real, distinctive brand marker from the reference site, not a generic tell. Never inside the authenticated dashboard, which stays plain white.

---

## 1. Public marketing site

- **Navbar**: white/transparent bg, logo left (or right in RTL), nav links center, "Log in" as text link + "Start free trial" as solid `--primary` pill/rounded button on the far side. Sticky on scroll, hairline `--border` bottom only when scrolled.
- **Hero**: headline in `--text-primary`, one key phrase highlighted in `--primary` (pick one treatment — color OR underline OR weight, not all three stacked). Dot-grid texture background. 2–3 small proof/stat pills scattered near the hero using `--warning-tint`/`--success-tint`/`--primary-tint`, echoing the reference's sticky-note highlights — keep to 2–3, not a cluttered scatter. Primary CTA solid `--primary` button + secondary "watch demo" outline/ghost button beside it.
- **Feature grid**: rounded 12px cards, 1px `--border` + soft shadow, one icon per card in a tinted circle, "Pro" tag as a small violet pill top-right where relevant. 3–4 columns, consistent card height. Optional role/segment tabs above the grid (e.g. "Dentist / Assistant / Receptionist / Clinic") as rounded segmented control, active tab filled `--primary`.
- **Pricing**: 3 tiers, rounded 16px cards, recommended tier gets a `--primary` 2px border + small pill ribbon ("Most popular"). Price bold 32px, monthly/annual toggle as rounded segmented control, discount as a small `--success-tint` pill.
- **Feature comparison table**: rounded 12px container, checkmarks in `--success` circles, dashes in `--text-muted`. Column headers in `--text-primary`; reserve color for the recommended column only — avoid a rainbow header per column.
- **Testimonials**: horizontal card row, rounded 12px, 1px `--border`, star rating in `--warning`, quote in `--text-primary`, name + role in `--text-secondary`. Short quotes (1–2 lines).
- **FAQ**: accordion, rounded 12px container, chevron toggle, small `--primary` pill eyebrow ("Questions") instead of tracked ALL-CAPS.
- **Footer**: dark variant using `--text-primary` as background, muted/white text, sentence-case column headers, brand + social icons row, newsletter capture with a rounded input + solid `--primary` button.
- **Cookie/notification banners**: rounded pill buttons are fine here — one primary pill action per banner, sentence case copy.

## 2. Auth & onboarding

Split-screen pattern, matching the real signup flow:

```
┌────────────────────────┬──────────────────────┐
│  White card, centered   │  Solid --primary bg   │
│  ┌────────────────────┐ │  + dot-grid texture   │
│  │ Form fields, rounded│ │                        │
│  │ inputs w/ icons     │ │  logo                  │
│  │ upload dropzone     │ │  "Create your account" │
│  │ (dashed border,     │ │  ● Step 1 — General    │
│  │ rounded, icon)      │ │  ○ Step 2 — Contact    │
│  └────────────────────┘ │  ○ Step 3 — Security   │
│  [ Continue → ]          │                        │
│  Already have an account?│                       │
└────────────────────────┴──────────────────────┘
```

- **Step indicator** (multi-step signup): numbered circles, active step filled `--primary` (or `--accent-violet` if you want the step rail visually distinct from primary actions), completed steps get a checkmark, upcoming steps outlined/muted on the tinted panel background.
- **Form card**: white, rounded 12px, soft shadow, inputs rounded 8px with a small leading icon (mail, building, lock) in `--text-muted`.
- **File/logo upload dropzone**: dashed 1px `--border`, rounded 12px, centered upload icon in a `--primary-tint` circle, helper text in `--text-secondary` below (accepted size/format).
- **Primary action button**: full-width, solid `--primary`, rounded 8px, label + directional arrow icon ("Continue →").
- **Secondary links** below the form (login instead, contact support): `--primary` text links, no underline until hover, centered, small size.
- **Login page**: same white-card-on-tinted-panel pattern, simplified to two fields + primary button; no step indicator, panel copy becomes a short welcome-back line instead.

## 3. Dashboard / app

```
┌──────────┬────────────────────────────────────────────┐
│ dentdz   │  Aperçu                    🔍   🔔  avatar ▾ │
│ logo     ├────────────────────────────────────────────┤
│          │  ┌─Revenus──┐ ┌─Dépenses─┐ ┌─RDV──────┐    │
│ Aperçu ● │  │ 19 000 DA│ │ 75 500DA │ │   5      │    │
│ Patients │  └──────────┘ └──────────┘ └──────────┘    │
│ Rendez-  │  ┌─ Line chart (area fill, --primary) ───┐  │
│  vous    │  │                                        │  │
│ Paiements│  └────────────────────────────────────────┘  │
│ ...      │  ┌─ Table: id / patient / statut(pill) ──┐  │
│          │  └────────────────────────────────────────┘  │
│ Déconnex.│                                              │
└──────────┴────────────────────────────────────────────┘
```

- **Sidebar**: `--surface` bg, `--text-secondary` icons/labels at rest; active item gets `--primary-tint` bg, `--primary` text/icon, soft rounded highlight.
- **KPI/stat cards**: rounded 12px, 1px `--border` + soft shadow, label in `--text-secondary` + trend pill (green/red) for the delta, big number bold 22–26px. Optional icon in a tinted circle, tinted-on-brand — never a rainbow of unrelated colors on one row.
- **Charts**: line charts get a soft gradient area fill under the line in `--primary`; donut/pie charts use the semantic set (primary, success, warning, violet) up to 4 segments max.
- **Tables**: rounded container (12px), 1px `--border`, row dividers in `--border`, zebra optional in `--surface`. Status column = pill badge with matching `-tint` bg + `-text` color. Names get a round colored initials avatar from the rotating semantic set.
- **Forms/inputs**: rounded 8px, 1px `--border`, `--primary` border + subtle `--primary-tint` glow on focus.
- **Settings/profile pages**: same card + form language as onboarding, no dot-grid texture (authenticated app stays plain white).

## Motion

Minimal, everywhere on the site:
- 150–200ms ease transitions on hover/focus/active state changes.
- One deliberate transition for panel/modal open (fade + 4–8px slide), gentle scale/opacity pop for toasts.
- At most one orchestrated entrance moment for the marketing hero; no hover-lift on every card, no fade-up-on-scroll on every section.

## Copy and labels

- Buttons say exactly what happens: "Save changes," "Send invoice," "Create your account" — never bare "Submit" or "OK."
- Status labels and empty states speak plainly: what happened, or what to do next.
- Errors state what went wrong and the fix, without an apologetic tone.
- Sentence case everywhere except the small pill eyebrow labels on marketing pages.

## Relationship to the `avoid-ai-generic-ui` skill

That skill's rules still apply as the default (single family, sentence case, restraint, one bold moment per screen). This file overrides it only on the specific points called out above — rounded shapes instead of sharp, soft shadows instead of hairline-only, and a defined multi-color semantic set instead of one accent. Where this file is silent on something, fall back to the general rules there.

## Quick checklist before shipping any page

- [ ] Applies to the actual page type built (marketing / auth-onboarding / dashboard) — not dashboard rules bled into a landing page or vice versa
- [ ] Cards/buttons/inputs use the defined radii (12px / 8px), status/tags are pill-shaped
- [ ] Shadows are the soft, single-weight kind defined above — never a default UI-kit `shadow-md`
- [ ] Blue (`--primary`) is dominant; success/danger/warning/violet only appear for their specific semantic meaning
- [ ] One type family, hierarchy via weight only
- [ ] Dot-grid texture on marketing + auth panels only, never inside the authenticated dashboard
- [ ] No tracked-out ALL-CAPS section eyebrows — pill labels instead
- [ ] Icon-circle accents stay tinted-on-brand, not a rainbow of unrelated colors per row
