---
name: Fare
description: A month of money drawn as a metropolitan rail diagram fired as enamel.
colors:
  line-scarlet: "#E7002A"
  line-cobalt: "#0057FF"
  line-amber: "#FFB800"
  line-green: "#009B4D"
  line-violet: "#8E4EC6"
  line-teal: "#00A3A3"
  enamel-ground: "#0A1330"
  enamel-raised: "#101D45"
  enamel-sunken: "#060C21"
  enamel-ink: "#FFFFFF"
  enamel-ink-muted: "#94A3C4"
  enamel-ink-faint: "#4C5C87"
  enamel-rule: "#1E2C57"
  enamel-focus: "#7FB0FF"
  porcelain-ground: "#EDF0F6"
  porcelain-raised: "#FFFFFF"
  porcelain-sunken: "#DFE4EE"
  porcelain-ink: "#0A1330"
  porcelain-ink-muted: "#4A5878"
  porcelain-ink-faint: "#9AA6C0"
  porcelain-rule: "#CFD7E6"
  porcelain-focus: "#0057FF"
typography:
  display:
    fontFamily: "OverpassMono-Bold"
    fontSize: "36"
    lineHeight: "42"
    letterSpacing: "-1"
  title:
    fontFamily: "Overpass-Heavy"
    fontSize: "26"
    lineHeight: "32"
    letterSpacing: "1.4"
    textTransform: "uppercase"
  station:
    fontFamily: "Overpass-Bold"
    fontSize: "12"
    lineHeight: "16"
    letterSpacing: "1.6"
    textTransform: "uppercase"
  body:
    fontFamily: "Overpass"
    fontSize: "17"
    lineHeight: "24"
    letterSpacing: "0"
  bodyStrong:
    fontFamily: "Overpass-SemiBold"
    fontSize: "17"
    lineHeight: "24"
    letterSpacing: "0"
  label:
    fontFamily: "Overpass-SemiBold"
    fontSize: "15"
    lineHeight: "20"
    letterSpacing: "0"
  caption:
    fontFamily: "Overpass"
    fontSize: "13"
    lineHeight: "18"
    letterSpacing: "0.1"
  amount:
    fontFamily: "OverpassMono-SemiBold"
    fontSize: "17"
    lineHeight: "24"
    letterSpacing: "-0.3"
  amountSmall:
    fontFamily: "OverpassMono"
    fontSize: "13"
    lineHeight: "18"
    letterSpacing: "-0.2"
rounded:
  full: "999px"
  plate: "12px"
  panel: "20px"
  sheet: "28px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
  xxxl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.line-scarlet}"
    textColor: "#FFFFFF"
    typography: "{typography.station}"
    rounded: "{rounded.full}"
    padding: "12px 16px"
    height: "52px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.enamel-ink}"
    typography: "{typography.station}"
    rounded: "{rounded.full}"
    padding: "12px 16px"
    height: "52px"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.enamel-ink}"
    typography: "{typography.station}"
    rounded: "{rounded.full}"
    padding: "12px 16px"
    height: "52px"
  button-danger:
    backgroundColor: "{colors.enamel-ground}"
    textColor: "#FF5A6E"
    typography: "{typography.station}"
    rounded: "{rounded.full}"
    padding: "12px 16px"
    height: "52px"
  field-plate:
    backgroundColor: "transparent"
    textColor: "{colors.enamel-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.full}"
    padding: "0 16px"
    height: "52px"
  field-plate-focus:
    backgroundColor: "transparent"
    textColor: "{colors.enamel-ink}"
    rounded: "{rounded.full}"
  keypad-key:
    backgroundColor: "transparent"
    textColor: "{colors.enamel-ink}"
    rounded: "{rounded.plate}"
    height: "56px"
    width: "31.8%"
  tab-interchange:
    backgroundColor: "{colors.line-scarlet}"
    textColor: "#FFFFFF"
    rounded: "{rounded.full}"
    size: "60px"
  category-roundel:
    backgroundColor: "transparent"
    textColor: "{colors.line-cobalt}"
    rounded: "{rounded.full}"
    size: "36px"
---

# Design System: Fare

## Overview

**Creative North Star: "The Midnight Transit Diagram"**

Fare draws a month of money as a network you are travelling, not a pie you are slicing. The whole surface is a metropolitan rail diagram fired as vitreous enamel: a midnight mural in the dark appearance, the same diagram fired on white station tile in the light one. Every visual decision descends from that one material fact. Categories are routes. Spending is distance travelled. A limit is the end-of-line bar. Overspending is a route carrying on past its terminus into a hatched run-out, the way a diagram marks a disrupted section.

The system is drawn, not decorated. Its parts are route lines, station bullets, minor-station ticks, interchange rings and terminus bars, and those same parts are what the icon set is built from — no borrowed glyph library, no generic UI symbol wearing transit colours. Density is signage density: generous vertical air on a 4pt grid, tracked all-caps lettering at small sizes, and a single mono face for every number so digits hold their columns down a list. Nothing is soft. Corners are either a full pill (interactive controls, which read as sections of track with bullets at each end) or a squared enamel plate; nothing sits at an in-between radius.

The refusals are explicit and were made against the incumbent budgeting-app arrangement: no enthroned balance numeral, no pastel category donut, no soft rounded card stack. The month's net is printed at the marker on the month line, where it arrives with the question that makes it mean something — how far through the month is this — rather than floated at the top of the screen on its own.

**Key Characteristics:**
- Six fixed route colours, constant across both appearances
- Two enamel appearances that swap ground and ink, never invert the lines
- Rasterised material grounds with grain and gloss, never a flat hex fill
- Overpass and Overpass Mono only; one all-caps display register
- Status stated in words as well as drawn; hue is never the only carrier
- Pill or plate; nothing in between
- 48pt touch targets throughout

## Colors

Six saturated signage colours on one of two enamel grounds. The palette is closed: there is no seventh accent and no tint ramp.

### Primary
- **Scarlet** (`line-scarlet`): The network's trunk colour. It is the entry action (the raised interchange in the tab bar), the active tab, the month line's travelled length, and the colour an over-budget route flips to. It is the only line colour with a job outside its own category.

### Secondary
- **Cobalt**, **Amber**, **Green**, **Violet**, **Teal** (`line-cobalt`, `line-amber`, `line-green`, `line-violet`, `line-teal`): Route colours. A category resolves to exactly one of these and the category editor offers only these six. Green additionally, in its `onGround` variant, marks income — the only amount in the app that takes a colour.

### Neutral
The two appearances are two full neutral sets, not a light/dark inversion of one.
- **Enamel** (`enamel-*`): The midnight mural. `ground` is the fired field, `raised` one tonal step up for panels, sheets and the tab bar, `sunken` for pressed wells. `ink` is porcelain lettering; `ink-muted` (7.0:1 on ground) carries secondary text; `ink-faint` is hairlines, disabled glyphs and spent track only. `rule` is relief-line ink: dividers, unspent route bed, control borders.
- **Porcelain** (`porcelain-*`): The same diagram on cool station tile — cool, never cream. Same seven roles, same names, so a component reads `theme.rule` without knowing which enamel it was fired on. `ink-muted` measures 6.1:1 on its ground.

Each appearance also carries an `onGround` set: text-safe variants of the six line colours for lettering, because a line colour that is legible as a 6pt stroke is not necessarily legible as 13pt type. On enamel these lighten (scarlet `#FF5A6E`, cobalt `#6FA5FF`, amber `#FFC53D`, green `#2ED47A`, violet `#C58AF9`, teal `#2EC8C8`); on porcelain they darken (`#C40024`, `#0044CC`, `#8A6200`, `#007A3D`, `#6E2FA8`, `#00706F`).

### Named Rules

**The Six Routes Rule.** Every category is one of exactly six line colours. No custom colour, no generated hue, no seventh line. The picker offers six swatches and nothing else.

**The Constant Lines Rule.** Switching appearance swaps the ground and the ink. The six line colours do not move. A diagram's lines do not change colour when you take it out of the tunnel.

**The Lettering Rule.** A raw line colour draws lines. Lettering in a line's colour uses that appearance's `onGround` variant. If you are typing a route colour into a text style, you have picked the wrong token.

**The Never Hue Alone Rule.** Budget status is carried by three signals at once: the route runs past its terminus into the hatched run-out, the travelled length flips to scarlet, and a sentence underneath states it in words ("€11,40 over the limit"). The sentence is what survives a colour-blind user, a greyscale screenshot, and a screen reader. Never ship a status that only a hue announces.

## Typography

**Display Font:** Overpass (Heavy / Bold), a Highway Gothic derivative — the signage lineage is real rather than borrowed
**Body Font:** Overpass (Regular / SemiBold)
**Label/Mono Font:** Overpass Mono (Regular / SemiBold / Bold)

Both families are self-hosted from `assets/fonts/` under the SIL OFL. Android will not synthesise weights for a custom family, so each weight is registered as its own family name (`Overpass-SemiBold`, `OverpassMono-Bold`, …); never set `fontWeight` on top of one.

**Character:** Transit-authority lettering. Wide, plainspoken, engineered for a wall at distance — tracked hard and set in caps wherever it labels something, left plain wherever it is prose to be read.

### Hierarchy
- **Display** (mono bold, 36/42, -1 tracking): The month's net, and nothing else. At most one per screen.
- **Title** (Heavy, 26/32, +1.4 tracking, uppercase): Screen titles.
- **Station** (Bold, 12/16, +1.6 tracking, uppercase): The diagram's own voice — section headings, tab labels, field labels, button labels, sheet titles.
- **Body** / **Body Strong** (Regular / SemiBold, 17/24): Prose, category names, row primaries.
- **Label** (SemiBold, 15/20): Dense control text inside sheets.
- **Caption** (Regular, 13/18): Status sentences, hints, errors, subtitles.
- **Amount** / **Amount Small** (mono SemiBold / Regular, 17/24 and 13/18, negative tracking): Every rendered quantity.

### Named Rules

**The One Display Register Rule.** Screen titles and section labels are the same tracked caps. The diagram does not run a sentence-case voice for screens and a caps voice for sheets.

**The Mono Column Rule.** Money is set in Overpass Mono so digits stay in their columns down a list, and `Money` is the only component that renders an amount. A `<Text>` containing a formatted currency string is a bug.

**The Scale Cap Rule.** Body, label and caption scale with the OS text-size setting without limit — that is the text people actually need bigger. Only display (1.35×), title (1.5×) and station (1.6×) cap their multiplier, because a 200% month total pushes the diagram off screen. Never cap body text.

## Layout

Everything sits on a 4pt grid: 4 / 8 / 12 / 16 / 24 / 32 / 48. Screen content is inset 24 horizontally; rows stack with 12 vertical padding and 8 internal gaps; sheet sections separate by 16 of space, never by a box.

Screens are a single column, no grid. On wide devices (tablet, web) the column is centred and capped at 620pt — the diagram is not improved by being 1000pt wide — against the full-bleed enamel ground behind it. That cap is the only responsive rule in the system; there are no breakpoints and no reflow.

Every screen is wrapped in the enamel `Screen`, which lays the rasterised surface under a safe-area frame with top/left/right edges claimed and the bottom left to the tab bar. Screen heads are a title (or the wordmark) over a full-bleed route rule 6pt thick in the screen's accent colour, with an open origin bullet at its left end.

Touch targets are 48pt, which clears both the iOS 44pt and Android 48dp minimums; buttons, fields and keypad keys run above it (52 and 56).

## Elevation & Depth

Depth is primarily material, not shadow. The two grounds are rasterised PNG surfaces carrying sprayed grain and a gloss fall (`scripts/make-textures.mjs`, committed to `assets/images/`), because a flat fill never reads as fired enamel. On top of that, layering is tonal: `ground` → `raised` → `sunken`, one step per level, and pressed states move a surface to `raised` rather than dimming it.

A cast shadow appears on exactly four things that genuinely float above the mural: the tab bar's raised interchange, the day picker's popover, the settings sheet, and the undo toast. Enamel is glossy, so that shadow is a real directional offset plus the tonal step — never a zero-offset halo.

### Shadow Vocabulary
- **Floating** (iOS `shadowOffset 0/6, opacity 0.28, radius 16, #000`; Android `elevation: 8`): The only shadow in the system. Applied to a surface that is genuinely detached from the diagram.

### Named Rules

**The Fired Surface Rule.** A screen ground is a raster enamel surface, never a hex fill. If a new full-screen surface renders as flat colour, it is not in this world yet.

**The No Halo Rule.** Depth is an offset shadow plus a tonal step. A zero-offset glow around a resting element is not elevation, it is a smudge.

**The Filled Fitting Rule.** Station fittings that sit on top of the diagram — the travelling interchange marker on a route — are filled with `ink`, porcelain, the way a fitting is on a fired sign. Filling them with `ground` punches a hole through the textured surface.

## Shapes

Two radii do almost all the work, and the choice between them is semantic rather than aesthetic. Interactive controls — buttons, fields, keypad-adjacent pills, icon buttons, chips, the close button, the interchange — are full pills (999), because a control in this world is a section of track with a bullet at each end. Tiled and containing surfaces are enamel plates: 12 for keypad keys and small tiles, 20 for panels, 28 for sheet-sized containers. Nothing sits between the two families.

Strokes come from the diagram's own drawing and are used at their named weight: hairline 1 (dividers, key borders), tick 2 (control borders, station ticks, minor stations), route 6 (a route line, a header rule, the tab bar's top edge), trunk 10 (a route at hero scale). Route lines are round-capped and turn at 45° — the bend by which a route climbs out of its row is a fixed 10pt and is part of the language, not a flourish.

The recurring silhouettes are: the ring struck through by a bar (the roundel — the product's mark, a category in a list, a station on a route), the open-vs-filled bullet, the double-ring interchange, and the squared end-of-line bar.

## Components

### Buttons
- **Shape:** Full pill (999), 2pt border, minimum height 52, padding 16 horizontal / 12 vertical, 12 gap. Every button carries an origin bullet at its left and, unless suppressed, a route arrow at its right — a short length of route with the destination named on the line.
- **Primary:** Scarlet fill, white content, scarlet border.
- **Secondary:** Transparent fill, `ink` border and content.
- **Quiet:** Transparent fill, `rule` border, `ink` content.
- **Danger:** `ground` fill, `onGround.scarlet` border and content.
- **Pressed / Disabled:** Opacity 0.82 pressed, 0.4 disabled. No transform, no colour shift.

### Inputs / Fields
- **Style:** The same pill plate as the buttons (999, 2pt `rule` border, transparent fill, 52 min height), so a form reads as one continuous line rather than a stack of unrelated boxes. A station label in tracked caps sits above it; a hint or error caption sits below.
- **Focus:** Border and the trailing bullet both take `focus`, and the bullet fills — the way an active section lights on a diagram.
- **Error:** Border, bullet and caption take `onGround.scarlet`. Never a red fill.
- **Select variant:** Same plate, opens a picker, chevron in `ink-muted`.

### Navigation
- **Style:** The tab bar is the network's trunk line — a `raised` bar with a 6pt route running across its top edge. Each destination hangs off that line on a tick (2 wide, 8 tall at rest, 14 and scarlet when active), above a drawn icon and a station-caps label.
- **Active:** Scarlet tick, filled icon, `ink` label. Inactive is `ink-muted` throughout.
- **Interchange:** Logging money is not a destination, so it is a 60pt scarlet interchange sitting on the line itself, raised 22 above the bar with a `raised`-coloured 4pt collar and the only cast shadow in the navigation.

### Icons
Authored SVG on a 24pt grid at a constant 2pt stroke with round caps, built from route lines that turn at 45°, station ticks, bullets, interchange rings and end-of-line bars. `filled` fills bullets and rings for the focused tab. A category's emoji is user content, not part of this set; with no emoji set, the roundel shows the line's letter.

### Route Line (signature component)
A budget drawn as a length of route, and the device the whole product rests on. The bed climbs out of the row on the 10pt 45° bend, runs level through three minor-station ticks, passes an 80% notice tick, and ends at a terminus bar fixed at 86% of the track — fixed, so two routes can be compared at a glance regardless of their limits. The travelled length is the money spent, drawn in the category's colour, ending in a double-ring interchange marker filled porcelain. Beyond the terminus lies the run-out: hatched at 45°, faint while under budget, and carried into at full scarlet when over. A `share` variant drops the terminus, run-out and minor stations and treats the whole track as the whole.

### Month Line (signature component)
The month drawn from first day to last: a `rule` bed, the elapsed portion travelled in scarlet, an open origin bullet, a squared terminus, and a marker at today. The month's net is printed in mono display beneath the marker and follows it along the track, clamped so it never runs off either end. Out and In totals sit below a hairline.

### Roundel
The ring struck through by a bar: the wordmark's mark, a category in a list, a station on a route. Ring weight is 16% of its size; the bar defaults to surface ink and overhangs the ring by 16%.

## Do's and Don'ts

### Do:
- **Do** assign every category one of the six line colours, and offer only those six anywhere a colour is chosen.
- **Do** state budget status in words underneath the route as well as drawing it — the sentence is the accessible read.
- **Do** use the appearance's `onGround` variant whenever a line colour becomes lettering.
- **Do** render every amount through `Money`, in the mono face.
- **Do** set screen titles and section labels in the same tracked caps; one display register.
- **Do** build new icons from the diagram's own parts on the 24pt grid at 2pt stroke.
- **Do** keep interactive controls on the full pill and containers on the plate radii (12 / 20 / 28).
- **Do** hold touch targets at 48 or above, and let body text scale without a cap.
- **Do** lay full-screen grounds as the rasterised enamel surface, and cap content at 620pt on wide devices.

### Don't:
- **Don't** invent a seventh route colour, a tint of an existing one, or a per-category generated hue.
- **Don't** invert the palette between appearances; the ground and ink swap, the six lines never move.
- **Don't** let hue alone carry a state — over-limit, warning and error each need a second, non-colour signal.
- **Don't** fill a station fitting that sits on the diagram with `ground`; it punches a hole in the texture. Fill it with `ink`.
- **Don't** use a zero-offset halo as elevation, and don't put a shadow on anything that is not genuinely detached from the mural.
- **Don't** set `fontWeight` on Overpass; pick the registered family for the weight you want.
- **Don't** cap the font-scale multiplier on body, label or caption text.
- **Don't** enthrone the balance as a floating hero numeral, draw a category donut, or stack soft rounded cards — the three arrangements this world was built against.
- **Don't** introduce a radius between the pill and the plates, or a stroke weight outside 1 / 2 / 6 / 10.
