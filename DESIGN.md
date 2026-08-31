---
name: Grandmaster Broadcast
colors:
  surface: '#111415'
  surface-dim: '#111415'
  surface-bright: '#373a3b'
  surface-container-lowest: '#0c0f10'
  surface-container-low: '#191c1d'
  surface-container: '#1d2021'
  surface-container-high: '#282a2b'
  surface-container-highest: '#323536'
  on-surface: '#e1e3e4'
  on-surface-variant: '#c5c6d2'
  inverse-surface: '#e1e3e4'
  inverse-on-surface: '#2e3132'
  outline: '#8e909c'
  outline-variant: '#444651'
  surface-tint: '#b4c5ff'
  primary: '#b4c5ff'
  on-primary: '#0b2b71'
  primary-container: '#00246b'
  on-primary-container: '#768eda'
  inverse-primary: '#425ba2'
  secondary: '#fff9ef'
  on-secondary: '#3a3000'
  secondary-container: '#ffdb3c'
  on-secondary-container: '#725f00'
  tertiary: '#bac7e1'
  on-tertiary: '#243145'
  tertiary-container: '#1e2b3f'
  on-tertiary-container: '#8592ab'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b4c5ff'
  on-primary-fixed: '#00174b'
  on-primary-fixed-variant: '#294389'
  secondary-fixed: '#ffe16d'
  secondary-fixed-dim: '#e9c400'
  on-secondary-fixed: '#221b00'
  on-secondary-fixed-variant: '#544600'
  tertiary-fixed: '#d6e3fe'
  tertiary-fixed-dim: '#bac7e1'
  on-tertiary-fixed: '#0e1c2f'
  on-tertiary-fixed-variant: '#3a475d'
  background: '#111415'
  on-background: '#e1e3e4'
  surface-variant: '#323536'
typography:
  display-lg:
    fontFamily: Chivo
    fontSize: 72px
    fontWeight: '900'
    lineHeight: 80px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Chivo
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
  headline-lg-mobile:
    fontFamily: Chivo
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
  tile-value:
    fontFamily: Space Grotesk
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: 0.05em
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  label-caps:
    fontFamily: Space Grotesk
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.1em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  grid-gap: 1rem
  section-padding: 2rem
  tile-padding: 1.5rem
  max-width: 1440px
---

## Brand & Style
The design system is engineered for high-stakes competition, evoking the prestige of a premier television game show broadcast. The aesthetic sits at the intersection of **Corporate Modern** and **Tactile Glassmorphism**, utilizing deep layers and luminous accents to create a sense of digital theater.

The target audience consists of professional presenters and engaged participants who require immediate clarity under pressure. The emotional response is one of focus, excitement, and authority. Every UI element is designed to feel "lit" from within, mimicking the high-end LED displays found on modern studio sets.

## Colors
The palette is dominated by **Midnight Navy** (Primary) and **Abyssal Black** (Tertiary) to provide a canvas of infinite depth. **Championship Gold** (Secondary) is reserved exclusively for high-priority information: active categories, selected point values, and victory states.

- **Primary:** Deep navy used for the main game board tiles and containers.
- **Secondary:** Radiant gold for borders, highlights, and critical "call-to-action" moments.
- **Tertiary:** True black for the global background, ensuring the blue tiles pop with a neon-like intensity.
- **Surface Tints:** Use 5-10% opacity gold overlays on blue surfaces to indicate "hover" or "active" states, simulating studio lighting.

## Typography
The typographic hierarchy emphasizes impact and legibility across large screens. 

**Chivo** provides the authoritative weight required for category headers and big reveals. **Space Grotesk** is used for point values and technical labels, adding a subtle "tech-forward" broadcast feel with its geometric proportions. **Hanken Grotesk** ensures that long-form clues remain highly readable even from a distance. All headlines should be set with tight tracking to mimic classic game show title cards.

## Layout & Spacing
This design system utilizes a **Fixed Grid** model to maintain the iconic "wall of tiles" structure. The layout is strictly architectural, relying on consistent gutters and symmetry.

- **Desktop:** A standard 6-column grid for categories, with 16px (1rem) gaps to ensure tiles feel interconnected but distinct.
- **Tablet:** 12px gaps; font sizes for tiles are reduced to prevent overflow.
- **Mobile:** Transition to a vertical scroll or a 3-column "zoomed" view to maintain legibility.
- **Rhythm:** Use multiples of 8px for all padding and margins to maintain a rigid, professional structure.

## Elevation & Depth
Elevation is achieved through **Luminous Layering** rather than traditional shadows. 

1. **Base:** The black background acts as the furthest plane.
2. **Surface:** Navy tiles sit above the base with a subtle 1px inner-glow (Gold at 20% opacity) to define edges.
3. **Active State:** When a tile is selected, it should "lift" using a vibrant gold drop shadow (blur 20px, spread -5px) to simulate it being backlit on a stage.
4. **Glassmorphism:** Overlays for clues use a 40px backdrop blur with a 70% opacity Navy fill, creating a focused "pop-up" effect that keeps the board visible but recessed in the background.

## Shapes
The shape language is **Soft** but disciplined. To maintain a professional broadcast look, we avoid overly bubbly corners. A 4px (0.25rem) radius is applied to all game tiles and buttons, providing a modern touch while retaining the structural integrity of a grid. Gold borders on active elements should be precisely aligned to these radii.

## Components
### Game Tiles
The core component. Default state is Primary Blue with `tile-value` typography centered. Inactive/Used states should fade to 20% opacity with no border. The "Active" state features a 2px Secondary Gold border.

### Action Buttons
Primary buttons use a solid Gold background with Black text for maximum contrast. Secondary buttons are outlined in Gold with Blue text. All buttons use `label-caps` for a disciplined, command-center feel.

### Clue Cards
Large, centered modals utilizing the Glassmorphism style. The text should be set in `headline-lg` (White) to ensure it is the focal point of the entire screen.

### Scoreboard
Positioned at the footer. Use dark containers with Gold numeric readouts. Each player's name should be in `label-caps`.

### Input Fields (Wager)
Deep navy backgrounds with a 1px Gold bottom-border only. Typography should be large and centered, mimicking a digital scoreboard entry.