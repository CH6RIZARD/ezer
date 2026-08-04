# Handoff: Ezer Redesign — Full Light + Dark Patch

## Overview
Complete Gen-Z / "financially elegant" redesign of the Ezer mobile app (Expo / React Native, `apps/mobile`), covering **every post-login screen** in **both Light and Dark themes**, plus new interaction logic:
- Locked-in-place 3D virtual card (360° touch rotation, tap-to-reveal)
- Calendar day → charge-details popover
- Wallet custom date-range picker with computed drain totals
- Clickable dashboard stat tiles
- Full Subscription Detail screen (charge history, price chart, smart payment options, save-smart projections, lifetime cost, cancel CTA)
- Settings, Drain Review screens
- New notification/alert card layouts

## About the Design Files
`Ezer App.dc.html` in this bundle is a **design reference created in HTML** — a working prototype showing the intended look and behavior. It is NOT production code. The task is to **recreate this design inside the existing Expo/React Native codebase** (`ezer/apps/mobile`) using its established patterns: `theme/colors.ts`, `theme/spacing.ts`, `utils/ThemeContext.tsx`, expo-router tabs, and the existing component folder. All state logic below maps 1:1 to React Native (`Animated`/`Reanimated`, `PanResponder` or `Gesture Handler`).

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii, and copy are final. Recreate pixel-perfectly.

## Fonts
- UI: **Space Grotesk** (400/500/600/700) — replaces the current default font
- Display numerals & serif accents: **Instrument Serif Italic** (stat values, month labels, drained totals, popover totals)
Load via `expo-font` / `@expo-google-fonts/space-grotesk` and `@expo-google-fonts/instrument-serif`.

## Design Tokens — THE FULL LIGHT + DARK PATCH

Replace `theme/colors.ts` with a themed token map consumed through `ThemeContext`. Token → hex for both modes:

| Token | Light | Dark |
|---|---|---|
| bg (screen) | #F7F3EA | #151021 |
| bg2 (inset/secondary) | #F7F3EA | #251C3D |
| card | #FFFFFF | #1F1834 |
| line (card border) | #EEE7D6 | #2C2347 |
| line2 (strong border) | #D6CCB4 | #3B2F5A |
| ink (primary text) | #241A38 | #F1EAF9 |
| inkDim | rgba(36,26,56,.5) | rgba(241,234,249,.5) |
| mut (secondary text) | #8A7F6B | #A79BC2 |
| mut2 (tertiary) | #B0A68F | #6F6390 |
| mut3 (legal/fine print) | #A99E86 | #7C7096 |
| accent (primary purple) | #4C1D95 | #4C1D95 (buttons) / #C4A9F7 (accInk text) |
| accSoft (accent chip bg) | #EDE6F9 | rgba(139,92,246,.2) |
| gold (text) | #A87D2F | #D6B36F |
| goldBg (gold buttons) | #A87D2F | #8F6B29 |
| goldLine | #E2C892 | #6E572B |
| goldSoft (gold chip bg) | #F6EBD3 | rgba(214,179,111,.15) |
| red (charges/danger) | #B3402A | #E0705A |
| cellBg (calendar day) | #FAF7F0 | #211A38 |
| cellHl (day with charges) | #FBF6EA | #2C2148 |
| tabBg (tab bar, blurred) | rgba(255,255,255,.88) | rgba(30,23,50,.9) |
| goldTile (spending-power tile) | linear-gradient(150deg,#FFFDF7,#FBF3E2) | linear-gradient(150deg,#2B2245,#332850) |
| success | #348F66 | #348F66 (on rgba(52,143,102,.14) bg) |

Fixed (theme-independent):
- Card front gradient (Amethyst finish): `linear-gradient(135deg,#5B21B6,#31136E 55%,#150A33)`; back: `#3B1580→#1E0B45→#0E0724`. Optional finishes: Onyx `#33303B→#17151D→#0B0A10`, Midnight `#2C4A8F→#16264F→#0B1226`.
- Metal edge gold: `linear-gradient(135deg,#E7C77E,#A87D2F 55%,#E7C77E)`
- Chart card purple: `linear-gradient(150deg,#31136E,#1D0B45)`, gold line `#E7C77E`, lavender subtext `#C9BCE8`
- Primary CTA gradient (Pay in 4 join): `linear-gradient(120deg,#4C1D95,#A87D2F)`, white text

Theme switch lives in **Settings → Appearance** (Light/Dark segmented control) and must re-theme every screen, the calendar, popovers, and the tab bar.

### Spacing / radius / type scale
- Screen padding: 20px horizontal; content bottom padding 96px (floating tab bar clearance)
- Radii: cards 18–20px, hero cards 20–22px, buttons 14–17px, chips 12–18px (pill), calendar cells 9–10px, virtual card 20px, phone-safe tab bar 24px
- Type: screen title 26–27px/700 (-0.6px tracking); section header 16–17px/700; card title 14.5–15px/700 or 600; body 12–13px; captions/labels 10–11px/700 with 0.5–0.8px letter-spacing, UPPERCASE; stat values 23px Instrument Serif Italic; drained/lifetime totals 36–38px Instrument Serif Italic in `red`
- EZER wordmark: 15px/700, 2.5px letter-spacing, `gold`
- Minimum hit target 44px

## Screens / Views

### 1. Home (dashboard)
- Header row: settings gear (42px circle, `card` bg, `line` border) · centered "Good Morning/Afternoon/Evening ✳" (13px `mut`) over "Your Dashboard" (24px/700 `ink`) · EZER wordmark right.
- **2×2 stat grid** (10px gap), each tile: `card` bg, `line` border, r18, icon 22px + serif value + UPPERCASE label. ALL FOUR ARE PRESSABLE (scale .96 on press):
  - Monthly Burn (flame, `red`) → switches to List view
  - 30-Day Risk (triangle, `gold`) → Alerts tab
  - Silent Subs (eye-off, #6E6580) → Drain Review screen
  - Spending Power ($400, `goldTile` bg + `goldLine` border, gold pulse animation) → Pay in 4 tab
- **Pay in 4 banner**: #2E1065 bg, r18 — "Ezer Pay in 4 / Spin the card. Split anything in four." → Pay in 4 tab.
- **Calendar/List segmented toggle**: `card` container r14, active segment #4C1D95 with white text.
- **Calendar** (hero): `card` r22; month header with prev/next round buttons + serif italic month label; SUN–SAT row (10px/700 `mut2`); day cells min-height 58px r10 — `cellBg`, or `cellHl` when charges exist; today's number in a #4C1D95 pill; up to 3 real merchant logo badges (15px) per day; day total "-$XX" in `red` 9px/700; press scales .93. Legend: red dot Renewals · gold dot Trials ending.
- **Tap a day with charges → popover** (below).
- List view: merchant rows (40px logo, name, type · date, amount, "in Nd" chip — trial chips `gold`, renewal chips `red`). Rows open Subscription Detail.

### 2. Day popover (Home)
Scrim rgba(20,10,46,.42) + blur. Sheet anchored above tab bar: `card` r22, spring-up animation. Serif italic date title, ✕ close. Rows: logo 38px, name, type label ("Renewal" / "Trial ends — becomes $X/mo"), amount in `red`. Footer: "Day total" + serif italic sum. Rows open Subscription Detail.

### 3. Pay in 4
- Title "Pay in *four*" (four in Instrument Serif Italic, #4C1D95) · sub "One card. Four easy payments. Zero drama." · EARLY ACCESS · COMING SOON pulse chip (goldSoft bg).
- **Virtual card — CRITICAL INTERACTION SPEC**:
  - Card is 308×190, r20, LOCKED in place (no translation ever). Container: 250px tall, centered, `touch-action: none`, perspective 1100px.
  - Idle: gentle float loop (translateY 0→-7px→0, 3.6s ease-in-out). Float **pauses in place** on first touch (do not remove/reset it — freeze current frame).
  - Drag rotates freely on X and Y: `ry += dx * 0.55`, `rx -= dy * 0.55` (degrees), `transform-style: preserve-3d`. While dragging apply a short smoothing transition (~120ms ease-out) so it never feels snappy.
  - Release: snap each axis to nearest multiple of 180° with a slow soft settle — 900ms `cubic-bezier(.22,1,.36,1)`.
  - Tap (movement < 4px): toggles number reveal — masked `••••  ••••  ••••  ••••` / STATUS PREVIEW ↔ `5312 7702 4401 8873` / EXPIRES 09/29.
  - Faces: front (chip = gold gradient rounded rect, contactless icon, number, CARDHOLDER "EZER MEMBER", status/expiry) and back (black mag stripe 36px at top-22px, signature strip with masked `•••` CVV, "SINGLE-USE VIRTUAL CARD" note) both `backface-visibility: hidden`, `translateZ(3px)` / `rotateY(180deg) translateZ(3px)`.
  - Between the faces: a full-size gold **metal core** layer (gold gradient, r20, translateZ(0)) — visible only edge-on mid-spin. NO outline/edge boxes around the card at rest.
  - Hint below: "Drag to spin it around · tap to reveal/hide the number".
- "Spend with clarity" card, "How it splits" 4 date tiles (PAY 1 highlighted gold), gradient join CTA → success state "You're on the early-access list ✓", shield reassurance line, legal fine print (`mut3`).

### 4. Wallet
- Horizontally snapping bank cards (300×178 r20): Sapphire Checking (blue gradient #2C4A8F→#141F3E, VISA •4821) and Gold Rewards (gold gradient #E9D9B8→#C4A15A→#9A7838, dark text, AMEX •1006). Animated page dots (active 22px gold pill).
- Range chips: **Custom** · This month · Last year (active: gold bg white text).
- **Custom → mini range calendar** (goldLine-bordered card, spring-up): month nav, S–M–T–W–T–F–S header, 32px day cells. First tap = start date, second = end (auto-swap if reversed). Endpoints: gold bg white text; days between: `goldSoft`. Footer: live "{range} · $X drained" (or "Tap a start date" / "Now tap an end date") + gold Done button. Chip label becomes the range ("Jun 3 – Jul 12").
  - **Logic**: expand every subscription into monthly charge occurrences over the trailing 18 months (charge day = sub's renewal day, clamped to 28); filter to selected range; group by merchant; drained total = sum. Breakdown list re-renders from the same grouping.
- Total drained card: serif italic 38px `red` amount, "N active subscriptions on this card".
- "Where it goes" merchant rows (open Subscription Detail) · "Review card drain" CTA → Drain Review.

### 5. Alerts
"Next 30 days · stay ahead of every charge". Trials expiring section (red "Ends in Nd", "$X/mo after trial", gold **Manage** button) and Upcoming renewals (purple **Act** button). Both buttons open Subscription Detail.

### 6. Subscription Detail (full logic)
Opened from: Home list rows, day-popover rows, Wallet breakdown rows, Alerts Manage/Act. Header: back chevron, 64px logo, name, ACTIVE / FREE TRIAL badge, price serif italic, next charge date, YTD.
- **Charge history** card: 6 rows — date, "Monthly", amount in `red`, "95% match" confidence.
- **How you're getting charged**: purple gradient card, white title, `#C9BCE8` subtitle; SVG line chart of the last 6 monthly prices — gold 3px line, gold-ringed dots, 3 faint gridlines, month labels; price-change chips "↑ $2.50 since May" (gold on rgba(231,199,126,.18)). Real histories: Netflix 10.99→12.99→15.49, YouTube 11.99→13.99, FitPass 29→34; others flat ("No price changes — steady at $X").
- **Smart payment options** card: two selectable radio rows (2px border, selected = gold border + goldSoft bg + gold dot):
  - *Pay full + save half*: "Pay $A + auto-save $A/2 · $1.5A total/mo"
  - *Pay full + match full*: "Pay $A + match $A into investing · $2A total/mo"
  - Selecting shows purple **Enable smart saving** button → green success banner: "✓ Smart saving on — each cycle pays $A and moves $X to your savings/investments automatically."
- **Save smart** card: gold toggle reveals "With *$A*/mo automatically saved:" + three selectable projection tiles (After 6 months / 1 year / 2 years = A×6 / A×12 / A×24, serif italic purple values) + green banner "That's $X saved without changing your lifestyle".
- **Lifetime cost** card: "This has cost you more than" + serif italic 36px `red` total (sum of charge history).
- **Cancel CTA**: full-width red "Cancel & choose where to send the money" → green "Cancellation started ✓ — choose where the money goes".

### 7. Settings
Appearance segmented Light/Dark (active #4C1D95); Account (email, member since); Linked banks (Sapphire/Gold rows); Notifications — 3 gold toggle rows (Renewal alerts · 3 days before, Trial warnings, Weekly digest · Sunday); Sign out (red text row).

### 8. Drain Review
Opened from "Review card drain" + Silent Subs tile. Subs ranked least-used first with usage labels (red flags: "Last visit 6 weeks ago" FitPass, "Opened once this month" Adobe, "Trial — never streamed" Hulu; gold: ChatGPT/YouTube usage; neutral: Spotify/Netflix/iCloud). Each row: **Cut it** outline button ↔ filled red "Cutting ✓" toggle. Header total: "you could free up $X/mo" — live sum of cut subs (defaults to sum of red-flagged).

### 9. Tab bar (all screens)
Floating: 12px from edges, 14px from bottom, `tabBg` + blur(14px), `line` border, r24. Four tabs: Home, Pay in 4 (card icon), Wallet, Alerts. Active: `accSoft` pill bg + accent icon/label (10px/700). Home indicator bar below.

## Interactions & Behavior (summary)
- Screen transitions: fade+rise 350ms ease (`opacity 0/translateY 14px → 1/0`)
- Press feedback: scale .93–.98, 150ms
- Pulse: gold box-shadow ring 0→9px fade, 2–2.6s loop (spending power tile, early-access dot)
- Card rotation: see Pay in 4 spec above — this exact feel (pause-in-place float, 120ms drag smoothing, 900ms settle) is a hard requirement
- Popover/pickers: 250–300ms spring-up `cubic-bezier(.2,.9,.3,1.2)`

## State Management
- `theme: 'light'|'dark'` (persisted; ThemeContext)
- `tab`, `screen: null|'settings'|'sub'|'drain'`, `sub` (selected subscription)
- Home: `view: 'calendar'|'list'`, `monthOffset`, `pop` (selected day)
- Card: `rx, ry, dragging, revealed, interacted`
- Wallet: `walletIdx`, `range: 'custom'|'thisMonth'|'lastYear'`, `rStart, rEnd, pickOpen, pickOffset`
- Sub detail: `payOpt: null|'half'|'full'`, `smartEnabled`, `saveSmart`, `ssMonths: 6|12|24`, `cancelStarted`
- Drain: `cancelled: {[subId]: bool}`; Settings: `notifs` map
- Data: subscriptions from the existing API; the prototype's demo set is Netflix $15.49, Hulu trial→$17.99, Spotify $11.99, iCloud+ $2.99, YouTube Premium $13.99, Adobe CC $22.99, ChatGPT Plus $20, FitPass Gym $34

## Assets
Merchant logos: use each merchant's real brand mark (the prototype draws simplified inline SVGs — replace with proper logo assets or an icon service), in a rounded-square tile (radius ≈ 32% of size), sizes 15px (calendar badges), 38–42px (rows), 64px (detail header).

## Files
- `Ezer App.dc.html` — the full interactive prototype (all screens, both themes via Settings, all logic). Open in a browser; use the Tweaks panel to preview themes and card finishes.
