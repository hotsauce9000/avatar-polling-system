# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** Avatar Polling System
**Generated:** 2026-02-11
**Category:** SaaS Dashboard / Polling Analytics
**Stack:** Next.js 16 + Tailwind CSS v4
**Icon Set:** Lucide React (consistent SVG icons only, NO emojis)

---

## Global Rules

### Color Palette (Violet/Purple Theme)

| Role | Hex | Tailwind | CSS Variable | Usage |
|------|-----|----------|--------------|-------|
| Primary | `#7C3AED` | `violet-600` | `--color-primary` | Sidebar active, primary buttons, key UI elements |
| Primary Light | `#A78BFA` | `violet-400` | `--color-primary-light` | Hover states, secondary accents, badges |
| Primary Dark | `#5B21B6` | `violet-800` | `--color-primary-dark` | Sidebar background, dark headers |
| Secondary | `#6366F1` | `indigo-500` | `--color-secondary` | Charts, data highlights, links |
| CTA/Accent | `#10B981` | `emerald-500` | `--color-cta` | Success states, primary CTA buttons, positive metrics |
| CTA Hover | `#059669` | `emerald-600` | `--color-cta-hover` | CTA hover state |
| Background | `#FAF5FF` | `violet-50` | `--color-background` | Main page background (light mode) |
| Surface | `#FFFFFF` | `white` | `--color-surface` | Cards, panels, content areas |
| Text Primary | `#1E1B4B` | `indigo-950` | `--color-text` | Headings, body text |
| Text Secondary | `#475569` | `slate-600` | `--color-text-muted` | Muted/secondary text (4.5:1+ contrast) |
| Text Tertiary | `#64748B` | `slate-500` | `--color-text-tertiary` | Timestamps, hints |
| Border | `#E2E8F0` | `slate-200` | `--color-border` | Card borders, dividers |
| Danger | `#EF4444` | `red-500` | `--color-danger` | Error states, destructive actions |
| Warning | `#F59E0B` | `amber-500` | `--color-warning` | Warning states, attention items |

**Color Notes:** Violet primary establishes premium SaaS identity. Emerald CTA provides strong contrast against purple. Indigo secondary for data/charts keeps the cool palette cohesive.

**Dark Mode Overrides (future):**
| Role | Hex | Tailwind |
|------|-----|----------|
| Background | `#0F0A1A` | custom |
| Surface | `#1A1230` | custom |
| Border | `#2D2548` | custom |
| Text Primary | `#E2E8F0` | `slate-200` |
| Text Secondary | `#94A3B8` | `slate-400` |

### Typography

- **Heading Font:** Poppins (geometric, modern, professional)
- **Body Font:** Inter (highly readable, clean, system-font feel)
- **Mono Font:** Fira Code (data tables, ASIN codes, metrics)
- **Mood:** modern, professional, clean, corporate, friendly, approachable

**Google Fonts:**
```css
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700&family=Fira+Code:wght@400;500&display=swap');
```

**Tailwind Config:**
```js
fontFamily: {
  heading: ['Poppins', 'sans-serif'],
  body: ['Inter', 'sans-serif'],
  mono: ['Fira Code', 'monospace'],
}
```

**Type Scale:**
| Element | Size | Weight | Font | Line Height |
|---------|------|--------|------|-------------|
| H1 | 2rem / 32px | 700 | Poppins | 1.2 |
| H2 | 1.5rem / 24px | 600 | Poppins | 1.3 |
| H3 | 1.25rem / 20px | 600 | Poppins | 1.4 |
| H4 | 1.125rem / 18px | 500 | Poppins | 1.4 |
| Body | 1rem / 16px | 400 | Inter | 1.5 |
| Body Small | 0.875rem / 14px | 400 | Inter | 1.5 |
| Caption | 0.75rem / 12px | 500 | Inter | 1.4 |
| Data/Code | 0.875rem / 14px | 400 | Fira Code | 1.6 |

### Spacing Variables

| Token | Value | Tailwind | Usage |
|-------|-------|----------|-------|
| `--space-xs` | `4px` | `p-1` | Tight gaps |
| `--space-sm` | `8px` | `p-2` | Icon gaps, inline spacing |
| `--space-md` | `16px` | `p-4` | Standard padding |
| `--space-lg` | `24px` | `p-6` | Section padding |
| `--space-xl` | `32px` | `p-8` | Large gaps |
| `--space-2xl` | `48px` | `p-12` | Section margins |
| `--space-3xl` | `64px` | `p-16` | Hero padding |

### Shadow Depths

| Level | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Subtle lift |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.06)` | Cards, buttons |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.1), 0 4px 6px rgba(0,0,0,0.05)` | Modals, dropdowns |
| `--shadow-xl` | `0 20px 25px rgba(0,0,0,0.1), 0 8px 10px rgba(0,0,0,0.04)` | Hero images, featured cards |
| `--shadow-violet` | `0 4px 14px rgba(124,58,237,0.15)` | Violet-tinted shadow for primary cards |

### Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | `6px` | Badges, small elements |
| `--radius-md` | `8px` | Buttons, inputs |
| `--radius-lg` | `12px` | Cards, panels |
| `--radius-xl` | `16px` | Modals, large containers |
| `--radius-full` | `9999px` | Avatars, pills |

---

## Layout: Sidebar Navigation Dashboard

### Sidebar Structure

```
+--sidebar (w-64)--+--content area (flex-1)--+
|                  |                          |
| Logo             | Top bar (h-16)           |
| ─────────        | ──────────────────────── |
| Nav Group 1      |                          |
|   > Active Item  | Main Content             |
|   > Item         |   (p-6, max-w-7xl)       |
|   > Item         |                          |
| ─────────        |                          |
| Nav Group 2      |                          |
|   > Item         |                          |
|   > Item         |                          |
|                  |                          |
| ─────────        |                          |
| User Profile     |                          |
| Settings         |                          |
+------------------+--------------------------+
```

**Sidebar Specs:**
| Property | Value |
|----------|-------|
| Width (expanded) | `256px` / `w-64` |
| Width (collapsed) | `72px` / `w-18` |
| Background | `#5B21B6` (violet-800) or `#1E1B4B` (indigo-950) |
| Text color | `#E2E8F0` (slate-200) |
| Active item bg | `rgba(255,255,255,0.15)` |
| Active item text | `#FFFFFF` |
| Hover item bg | `rgba(255,255,255,0.08)` |
| Icon size | `20px` / `w-5 h-5` |
| Item padding | `12px 16px` |
| Item border-radius | `8px` |
| Section divider | `1px solid rgba(255,255,255,0.1)` |
| Mobile breakpoint | `< 768px` (sidebar becomes overlay) |

**Sidebar Behavior:**
- Desktop: Fixed left, always visible (collapsible to icon-only on md breakpoint)
- Tablet (768px-1024px): Collapsed by default, expand on hover or toggle
- Mobile (<768px): Hidden off-screen, hamburger toggle, overlay with backdrop blur

---

## Component Specs

### Buttons

```css
/* Primary CTA Button (Emerald) */
.btn-primary {
  background: #10B981;
  color: white;
  padding: 10px 20px;
  border-radius: 8px;
  font-weight: 600;
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  transition: all 200ms ease;
  cursor: pointer;
}
.btn-primary:hover {
  background: #059669;
}
.btn-primary:focus-visible {
  outline: 2px solid #10B981;
  outline-offset: 2px;
}

/* Secondary Button (Violet outline) */
.btn-secondary {
  background: transparent;
  color: #7C3AED;
  border: 1.5px solid #7C3AED;
  padding: 10px 20px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}
.btn-secondary:hover {
  background: #FAF5FF;
}

/* Ghost Button */
.btn-ghost {
  background: transparent;
  color: #475569;
  padding: 10px 20px;
  border-radius: 8px;
  font-weight: 500;
  transition: all 200ms ease;
  cursor: pointer;
}
.btn-ghost:hover {
  background: #F1F5F9;
  color: #1E1B4B;
}

/* Danger Button */
.btn-danger {
  background: #EF4444;
  color: white;
  padding: 10px 20px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}
```

### Cards

```css
/* Standard Card */
.card {
  background: white;
  border: 1px solid #E2E8F0;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
  transition: all 200ms ease;
}
.card:hover {
  box-shadow: 0 4px 14px rgba(124,58,237,0.1);
  border-color: #A78BFA;
}

/* Glassmorphism Card (for featured/hero content) */
.card-glass {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 12px;
  padding: 24px;
}

/* KPI/Metric Card */
.card-metric {
  background: white;
  border: 1px solid #E2E8F0;
  border-radius: 12px;
  padding: 20px;
  border-left: 4px solid #7C3AED;
}
```

### Inputs

```css
.input {
  padding: 10px 14px;
  border: 1.5px solid #E2E8F0;
  border-radius: 8px;
  font-size: 14px;
  font-family: 'Inter', sans-serif;
  color: #1E1B4B;
  background: white;
  transition: border-color 200ms ease;
  width: 100%;
}
.input::placeholder {
  color: #94A3B8;
}
.input:focus {
  border-color: #7C3AED;
  outline: none;
  box-shadow: 0 0 0 3px rgba(124,58,237,0.1);
}
.input:invalid {
  border-color: #EF4444;
}
```

### Modals

```css
.modal-overlay {
  background: rgba(15, 10, 26, 0.6);
  backdrop-filter: blur(4px);
}
.modal {
  background: white;
  border-radius: 16px;
  padding: 32px;
  box-shadow: 0 20px 25px rgba(0,0,0,0.15);
  max-width: 500px;
  width: 90%;
}
```

### Tables (for polling data)

```css
.table-header {
  background: #FAF5FF;
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #475569;
  padding: 12px 16px;
}
.table-row {
  border-bottom: 1px solid #F1F5F9;
  padding: 12px 16px;
  transition: background 150ms ease;
}
.table-row:hover {
  background: #FAF5FF;
}
```

### Badges/Tags

```css
.badge-violet { background: #EDE9FE; color: #5B21B6; }
.badge-emerald { background: #D1FAE5; color: #065F46; }
.badge-amber { background: #FEF3C7; color: #92400E; }
.badge-red { background: #FEE2E2; color: #991B1B; }
.badge {
  padding: 2px 10px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
}
```

---

## Style Guidelines

**Primary Style:** Glassmorphism (subtle)
- Use glassmorphism sparingly -- for hero sections, modals, and featured cards only
- Regular dashboard content uses clean flat cards with subtle borders
- Sidebar and navigation use solid dark violet backgrounds

**Keywords:** Frosted glass, transparent, blurred background, layered, depth

**Key Effects:**
- Backdrop blur (10-20px) on glass elements
- Subtle border: `1px solid rgba(255,255,255,0.2)` on glass elements
- Violet-tinted shadows on hover: `0 4px 14px rgba(124,58,237,0.15)`
- Smooth transitions: 200ms ease for all interactive states

---

## Chart & Data Visualization

**For Polling Comparison Data:**

| Data Type | Best Chart | Library | Use Case |
|-----------|------------|---------|----------|
| Compare listings | Bar Chart (horizontal) | Recharts | Comparing Amazon listings side-by-side |
| Vote distribution | Donut Chart | Recharts | Showing poll results percentage |
| Rating breakdown | Grouped Bar | Recharts | Star ratings across products |
| Multi-variable | Radar/Spider | Recharts | Feature comparison across listings |
| Trend over time | Line Chart | Recharts | Poll trend data |

**Chart Color Palette (ordered):**
1. `#7C3AED` (violet-600) -- primary data
2. `#6366F1` (indigo-500) -- secondary data
3. `#10B981` (emerald-500) -- positive/winning
4. `#F59E0B` (amber-500) -- attention/neutral
5. `#EF4444` (red-500) -- negative/losing
6. `#A78BFA` (violet-400) -- tertiary data

**Chart Guidelines:**
- Add value labels on bars for clarity
- Hover tooltips on all data points
- Provide table alternative for accessibility
- Sort bars in descending order
- Limit pie/donut to 5-6 segments max

---

## Dashboard Layout Pattern

**Product Type Match:** Analytics Dashboard + Micro SaaS
- Primary Style: Data-Dense Dashboard with clean spacing
- Dashboard Style: Drill-Down Analytics + Comparative
- Landing Pattern: Hero + Features + CTA (for marketing page)

**Dashboard Grid:**
```
12-column grid
--grid-gap: 16px (gap-4)
--sidebar-width: 256px
--header-height: 64px
--card-padding: 20-24px
--content-max-width: 1280px (max-w-7xl)
```

---

## Accessibility Requirements (CRITICAL)

| Rule | Requirement | Implementation |
|------|-------------|----------------|
| Color Contrast | 4.5:1 minimum for normal text | `#1E1B4B` on `#FAF5FF` = 12.4:1 (passes) |
| Touch Targets | 44x44px minimum | All buttons/links min `h-11 w-11` |
| Focus States | Visible 2-3px focus ring | `focus-visible:ring-2 ring-violet-500 ring-offset-2` |
| ARIA Labels | Icon-only buttons need labels | `aria-label="Close menu"` |
| Keyboard Nav | Tab order matches visual order | Semantic HTML, `tabindex` only when needed |
| Color-only info | Never use color alone | Icons + text alongside color indicators |
| Reduced Motion | Respect user preference | `@media (prefers-reduced-motion: reduce)` |
| Form Labels | All inputs need labels | `<label htmlFor="...">` on every input |
| Error Messages | Announced to screen readers | `role="alert"` or `aria-live="polite"` |

**Violet Accessibility Notes:**
- `#7C3AED` on white = 4.6:1 (passes AA for large text)
- `#5B21B6` on white = 7.2:1 (passes AAA)
- For small text on violet backgrounds, use white (`#FFFFFF`) for 8.3:1 ratio
- Avoid `#A78BFA` (violet-400) as text on light backgrounds (fails contrast)

---

## Next.js 16 Stack Guidelines

| Category | Guideline | Implementation |
|----------|-----------|----------------|
| Fonts | Apply font in root layout | `<body className={inter.className}>` in `layout.tsx` |
| Images | Use fill for responsive images | `<Image fill className="object-cover"/>` |
| Performance | Avoid layout shifts | Skeleton loaders with `<Skeleton className="h-48"/>` |
| Routing | Use App Router | `app/` directory with `page.tsx` and `layout.tsx` |
| Data | Server Components default | Fetch data in Server Components, client for interactivity |

---

## Anti-Patterns (Do NOT Use)

- Do not use emojis as icons -- Use SVG icons (Lucide React)
- Do not skip cursor:pointer -- All clickable elements must have it
- Do not use layout-shifting hovers -- Avoid scale transforms that shift content
- Do not use low contrast text -- Maintain 4.5:1 minimum contrast ratio
- Do not use instant state changes -- Always use transitions (150-300ms)
- Do not use invisible focus states -- Focus states must be visible for a11y
- Do not use excessive animation -- Keep it subtle, 150-300ms micro-interactions
- Do not default to dark mode -- Start with light mode, add dark as enhancement
- Do not mix icon sets -- Pick Lucide and stick with it everywhere
- Do not use `bg-white/10` in light mode -- Use `bg-white/80` or higher opacity for glass
- Do not use `text-gray-400` for body text in light mode -- Too low contrast

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No emojis used as icons (use Lucide React SVG instead)
- [ ] All icons from Lucide React (consistent sizing w-5 h-5)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard navigation (`focus-visible:ring-2`)
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] No content hidden behind fixed sidebar/navbar
- [ ] No horizontal scroll on mobile
- [ ] Sidebar collapses properly on mobile (overlay with backdrop)
- [ ] All form inputs have associated labels
- [ ] Error states use icon + text (not color alone)
- [ ] Charts have table alternative for accessibility
- [ ] Violet primary color passes contrast checks on chosen backgrounds
