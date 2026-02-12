---
title: "feat: Premium SaaS UI Upgrade"
type: feat
date: 2026-02-11
deepened: 2026-02-11
reviewed: 2026-02-11
---

# Premium SaaS UI Upgrade (Simplified)

## Overview

Transform zinc-only prototype into a polished SaaS app. Add sidebar nav, violet accent color, Lucide icons, smooth transitions, elevated visual hierarchy across 4 pages.

**Audience:** Small internal team. Make it visually enjoyable without over-engineering.

## Decisions (from plan review)

- **CSS vars:** 6-12 max (just violet tokens + sidebar colors). Use Tailwind classes directly for everything else.
- **CUT:** Progress bar viz, score bar viz, "Popular" badge, styled checkbox, focus trap, body scroll lock, scaleX progress bar, usePathname isolation
- **KEEP:** `h-dvh`, `border-l-2 border-transparent`, Escape key close, `aria-expanded`, `role="navigation"`, close-on-route-change
- **Security middleware:** Moves to Phase 2 (not last)
- **Auth consolidation:** Simple â€” just move the listener to `(app)/layout.tsx`. No AuthContext needed.
- **Dashboard decomposition:** Split into sub-components BEFORE restyling (easier to edit safely)
- **Sidebar name:** `AppSidebar.tsx` (not generic `Sidebar.tsx`)
- **Transitions:** Use targeted (`transition-colors`, `transition-transform`) from the start. Never `transition-all`.
- **params Promise:** Ignore for now (uses `useParams()` hook which is not affected)
- **Stripe URL validation:** Simple check: `new URL(url).hostname.endsWith('.stripe.com')`

## Architecture

```
src/app/
  layout.tsx                    # Root (Geist fonts, metadata)
  globals.css                   # 6-12 violet CSS vars
  page.tsx                      # Landing (no sidebar)
  auth/callback/page.tsx        # Auth callback (no sidebar)
  (app)/
    layout.tsx                  # "use client" â€” sidebar + main + auth check
    dashboard/page.tsx
    experiments/page.tsx
    jobs/[jobId]/page.tsx
src/components/
  AppSidebar.tsx                # Sidebar nav component
middleware.ts                   # Server-side auth gating
```

## Color System

Use Tailwind classes directly. No custom properties needed for these:

| Usage | Light | Dark |
|-------|-------|------|
| CTA buttons | `bg-violet-600 hover:bg-violet-700` | `dark:bg-violet-500 dark:hover:bg-violet-400` |
| Accent text | `text-violet-600` | `dark:text-violet-400` |
| Focus ring | `focus:ring-violet-500` | Same |
| Active sidebar bg | `bg-violet-50` | `dark:bg-violet-950/30` |
| Active sidebar border | `border-violet-600` | `dark:border-violet-400` |

Financial CTAs (Stripe) stay zinc/neutral. Status colors (emerald/blue/red/amber) unchanged.

## Phase 1: Foundation

**What:** Install lucide-react, fix CSS, fix metadata.

- [x] Install `lucide-react` in `apps/web`
- [x] `globals.css` â€” add 6-12 CSS vars for sidebar dark bg colors, fix font to Geist (remove Arial override), use `h-dvh`
- [x] `layout.tsx` â€” fix metadata title to "Avatar Polling System" + real description

**Files:** `globals.css`, `layout.tsx`, `package.json`
**Done when:** `npm run build` passes, body text is Geist not Arial, metadata is correct.

## Phase 2: Sidebar + Route Group + Auth + Security

**What:** Create the sidebar, set up route groups, move pages, add middleware.

- [x] Create `middleware.ts` â€” redirect unauthed users from `/dashboard`, `/experiments`, `/jobs/*` to `/`
- [x] Create `AppSidebar.tsx` â€” 240px fixed, 2 nav items (Dashboard, Experiments) + sign out, Lucide icons, mobile hamburger overlay, `aria-expanded`, Escape key close, close on route change, `h-dvh`
- [x] Create `(app)/layout.tsx` â€” "use client", flex row (sidebar + main), auth check + redirect, move `onAuthStateChange` listener here
- [x] Move `dashboard/page.tsx` â†’ `(app)/dashboard/page.tsx`
- [x] Move `experiments/page.tsx` â†’ `(app)/experiments/page.tsx`
- [x] Move `jobs/[jobId]/page.tsx` â†’ `(app)/jobs/[jobId]/page.tsx`
- [x] Remove inline `<header>` from all 3 moved pages
- [x] Remove per-page `onAuthStateChange` listeners (layout handles it now)
- [x] Split dashboard into sub-components: `DashboardComparison.tsx`, `DashboardCredits.tsx`, `DashboardCreditPacks.tsx`, `DashboardRecentJobs.tsx` (extract sections, keep state in parent)

**Files created:** `middleware.ts`, `AppSidebar.tsx`, `(app)/layout.tsx`, 4 dashboard sub-components
**Files moved:** 3 page files into `(app)/`

**Done when:** Sidebar shows on all 3 authed pages, doesn't show on landing/callback, mobile hamburger works, unauthenticated users get redirected without content flash, realtime updates on job detail still work, Stripe redirect still works.

## Phase 3: Page Upgrades (all pages in one pass)

**What:** Apply violet accent, Lucide icons, hover states, dark mode fixes across all pages.

### Landing page (`page.tsx`)
- [x] Auth redirect: if user has session, push to `/dashboard`
- [x] Gradient text heading (violet)
- [x] Violet accent on step numbers in feature cards
- [x] Hover lift on cards (`hover:-translate-y-0.5 transition-transform duration-200`)
- [x] Sign-in button: `bg-violet-600 hover:bg-violet-700`
- [x] Focus ring: `focus:ring-2 focus:ring-violet-500`
- [x] Badge with violet tint

### Dashboard (sub-components)
- [x] Violet "Compare" button, violet focus rings on inputs
- [x] Credit balance number: `text-violet-600`
- [x] Add Lucide icons to section headers (`Coins`, `FlaskConical`, `Clock`, `Zap`)
- [x] Hover states on job/experiment list items + `cursor-pointer`
- [x] Grid breakpoints: `md:grid-cols-3` â†’ `lg:grid-cols-3`
- [x] Credit packs: hover elevation, keep buy buttons neutral (Stripe)

### Job detail
- [x] Lucide icons on sections (`Package`, `Trophy`, `Users`, `Eye`, `Wrench`)
- [x] Larger winner badge with violet accent
- [x] Numbered violet badges on fix recommendations (#1, #2, #3)
- [x] Avatar cards: subtle violet left border
- [x] Save button: violet, focus rings violet
- [x] Grid: `md:grid-cols-6` â†’ `lg:grid-cols-3 xl:grid-cols-6`

### Experiments
- [x] Hover state on list items + `cursor-pointer`
- [x] Delta values: green for positive, red for negative
- [x] Lucide icons on section headers (`Filter`, `List`, `GitCompare`)
- [x] Violet focus rings on filter inputs

**Done when:** All pages have violet accents, icons, hover states. Status badge colors unchanged. Financial CTAs still neutral.

## Phase 4: Polish

**What:** Consistency audit, dark mode, responsive, final testing.

- [x] Audit all interactive elements for `cursor-pointer`
- [x] Verify all transitions are targeted (no `transition-all` anywhere)
- [x] Standardize button heights to `h-10`
- [x] Fix `text-zinc-500` missing `dark:text-zinc-400` variants
- [x] Fix auth callback page missing dark mode classes
- [x] Verify violet-400 used for dark mode text (contrast)
- [x] Verify all focus rings use violet-500
- [x] Validate Stripe checkout URL: `new URL(url).hostname.endsWith('.stripe.com')`
- [x] Test responsive: 375px, 768px, 1024px, 1440px
- [x] Verify Supabase realtime still works on job detail
- [x] Verify Stripe redirect still works
- [x] Update `tasks/todo.md` with review section

**Done when:** Consistent across all pages, dark mode works, mobile works, no regressions.

## Risk Checklist

- [x] `@/lib/*` imports still resolve after route group move (they will â€” `@/*` maps to `./src/*`)
- [x] Realtime subscription on job detail still works (it's in page component, not layout)
- [x] Stripe `?checkout=success` return works (route group doesn't change URLs)
- [x] No horizontal scroll at any breakpoint

## What We're NOT Doing (v2)

- Collapsed sidebar / icon-only mode
- Shared Card/Button/Input components
- Focus trap / body scroll lock on mobile
- Progress bar visualization
- Score bar visualization
- GPU-accelerated scaleX progress bar
- usePathname isolation into leaf components
- ~60 CSS custom properties
- Framer Motion / animation library
- shadcn/ui / Radix
