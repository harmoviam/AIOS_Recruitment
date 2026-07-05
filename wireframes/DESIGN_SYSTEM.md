# Design System & Component Specifications

## Complete Design System for AIOS Recruitment

---

## PART 1: COLOR SYSTEM

### Primary Colors
```
Primary Indigo (#6366f1)
├─ RGB: 99, 102, 241
├─ HSL: 239°, 84%, 67%
├─ Usage: Primary actions, active states, links
├─ Hover: #4f46e5 (darker)
├─ Active: #4338ca (even darker)
└─ Light variant: rgba(99, 102, 241, 0.1) for backgrounds

Secondary Pink (#ec4899)
├─ RGB: 236, 72, 153
├─ HSL: 329°, 85%, 60%
├─ Usage: Accents, highlights, gradients
├─ Hover: #db2777 (darker)
└─ Light variant: rgba(236, 72, 153, 0.1) for backgrounds

Primary Gradient (for buttons)
└─ 135deg linear-gradient(#6366f1, #ec4899)
```

### Semantic Colors
```
Success (#10b981)
├─ RGB: 16, 185, 129
├─ HSL: 160°, 84%, 39%
├─ Usage: Positive actions, confirmations, success states
└─ Light variant: rgba(16, 185, 129, 0.1)

Warning (#f59e0b)
├─ RGB: 245, 158, 11
├─ HSL: 38°, 92%, 50%
├─ Usage: Alerts, cautions, pending states
└─ Light variant: rgba(245, 158, 11, 0.1)

Danger (#ef4444)
├─ RGB: 239, 68, 68
├─ HSL: 0°, 84%, 60%
├─ Usage: Errors, dangerous actions, rejections
└─ Light variant: rgba(239, 68, 68, 0.1)

Info (#3b82f6)
├─ RGB: 59, 130, 246
├─ HSL: 217°, 92%, 60%
├─ Usage: Information, notifications, hints
└─ Light variant: rgba(59, 130, 246, 0.1)
```

### Neutral Colors (Grayscale)
```
Slate Scale (for text, backgrounds, borders)
├─ White: #ffffff (backgrounds)
├─ Surface: #f8fafc (light backgrounds, cards)
├─ Border: #e2e8f0 (light borders)
├─ Muted: #94a3b8 (disabled, less important)
├─ Secondary Text: #64748b (secondary info)
├─ Primary Text: #1e293b (main text)
└─ Almost Black: #0f172a (strong emphasis)
```

### Accessibility (WCAG AA)
- All text on primary colors: ✅ 4.5:1 minimum contrast
- Focus states: ✅ 3px solid primary color outline
- Error states: ✅ Supports color-blind vision
- Icons: ✅ Accompanied by text labels where needed

---

## PART 2: TYPOGRAPHY

### Font Family Stack
```css
-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 
Oxygen, Ubuntu, Cantarell, 'Fira Sans', 'Droid Sans', 
'Helvetica Neue', sans-serif
```

### Type Scale
```
Display (H1):  2.5rem (40px) | 700 weight | 1.2 line-height
Heading 1 (H2): 2rem (32px)   | 700 weight | 1.3 line-height
Heading 2 (H3): 1.5rem (24px) | 700 weight | 1.3 line-height
Heading 3 (H4): 1.25rem (20px)| 700 weight | 1.4 line-height
Heading 4 (H5): 1.125rem (18px)| 600 weight | 1.4 line-height
Heading 5 (H6): 1rem (16px)   | 600 weight | 1.5 line-height
Body Large:     0.95rem (15px)| 400 weight | 1.6 line-height
Body:           0.9rem (14px) | 400 weight | 1.6 line-height
Body Small:     0.85rem (13px)| 400 weight | 1.5 line-height
Caption:        0.8rem (12px) | 500 weight | 1.4 line-height
Micro:          0.75rem (12px)| 400 weight | 1.2 line-height
```

### Font Weights
```
100: Thin        - Not used
300: Light       - Not used
400: Regular     - Body text, descriptions
500: Medium      - Secondary headings, labels
600: Semibold    - Small headings, emphasis
700: Bold        - Headings, strong emphasis
800: Extra Bold  - Not recommended
900: Black       - Not recommended
```

### Letter Spacing
```
Display: -0.02em (tight)
Headings: -0.01em (tight)
Body: 0em (normal)
Captions: 0.01em (relaxed)
Labels: 0.01em (relaxed)
```

### Line Height
```
Display/Headings: 1.2-1.4
Body: 1.5-1.6
Caption/Label: 1.4-1.5
```

### Example Usage
```html
<h1 style="font-size: 2rem; font-weight: 700; line-height: 1.2;">
  Dashboard Overview
</h1>

<p style="font-size: 0.9rem; font-weight: 400; line-height: 1.6;">
  This is body text that appears throughout the application.
</p>

<span style="font-size: 0.75rem; font-weight: 500; letter-spacing: 0.01em;">
  CAPTION TEXT
</span>
```

---

## PART 3: SPACING SYSTEM

### Spacing Scale (8px base)
```
0:    0px      (no space)
1:    4px      (micro)
2:    8px      (xs)
3:    12px     (extra small)
4:    16px     (small)
6:    24px     (medium)
8:    32px     (large)
12:   48px     (extra large)
16:   64px     (2xl)
20:   80px     (3xl)
24:   96px     (4xl)
```

### Padding Scale
```
Component Padding:
- Compact:    8px 12px
- Standard:   12px 16px
- Comfortable: 16px 24px
- Spacious:   24px 32px

Button Padding:
- Small:      8px 12px (28px height)
- Medium:     10px 16px (36px height)
- Large:      12px 24px (44px height)

Card Padding:
- Standard:   16px or 24px
- Internal:   12px spacing between elements
```

### Margin Scale
```
Between Sections:  48px-64px
Between Components: 24px-32px
Between Elements:   12px-16px
Element Groups:     8px
Line Items:         4px-8px
```

### Gap (Flexbox)
```
Tight:      4px-8px (inline elements)
Comfortable: 12px-16px (flex containers)
Spacious:   24px (major sections)
```

---

## PART 4: BORDER RADIUS

### Border Radius Scale
```
Sharp:        0px    (not recommended)
Small:        4px    (buttons, badges)
Standard:     8px    (inputs, small cards)
Large:        12px   (cards, modals)
Extra Large:  16px   (large containers)
Full (50%):   9999px (circles, pills)
```

### Usage by Component
```
Buttons:              4px-8px
Input Fields:         8px
Cards:                12px
Modals:               12px
Badges:               4px-6px
Avatars/Images:       8px-100%
Floating Button:      50%
Pill Buttons:         50%
Dropdown Items:       8px
Tooltips:             8px
```

---

## PART 5: SHADOW SYSTEM

### Elevation & Shadows
```
Elevation 0 (Surface)
└─ No shadow
└─ Background: white or surface

Elevation 1 (Cards, Buttons)
└─ box-shadow: 0 2px 8px rgba(0,0,0,0.05)
└─ Used: Cards, dropdown items

Elevation 2 (Hovered Cards)
└─ box-shadow: 0 4px 12px rgba(0,0,0,0.08)
└─ Used: Card hover, elevated buttons

Elevation 3 (Floating Elements)
└─ box-shadow: 0 8px 16px rgba(0,0,0,0.12)
└─ Used: Floating buttons, popovers

Elevation 4 (Modals, Floating Action Button)
└─ box-shadow: 0 12px 24px rgba(0,0,0,0.15)
└─ Used: Modals, floating action buttons

Elevation 5 (Maximum - Overlays)
└─ box-shadow: 0 20px 40px rgba(0,0,0,0.2)
└─ Used: Overlays, full-screen modals

Primary Color Shadow (Special Cases)
└─ box-shadow: 0 8px 16px rgba(99, 102, 241, 0.3)
└─ Used: Primary buttons on hover
```

### Transition Shadows
```
Smooth Transition Duration: 200ms
Transition: box-shadow 200ms ease-in-out
```

---

## PART 6: COMPONENT SPECIFICATIONS

### BUTTON COMPONENT

#### Button Variants
```
1. Primary Button
   ├─ Background: Gradient (Indigo → Pink)
   ├─ Color: White
   ├─ Border: None
   ├─ Padding: 10px 16px (md) or 12px 24px (lg)
   ├─ Border Radius: 8px
   ├─ Font Weight: 600
   ├─ Hover: Transform Y(-2px), Shadow elevation +1
   ├─ Active: Shadow reduction, scale 0.98
   ├─ Disabled: Opacity 0.6
   └─ Icon Space: 8px from text

2. Secondary Button
   ├─ Background: Surface color
   ├─ Color: Primary text
   ├─ Border: 1px solid border color
   ├─ Padding: 10px 16px
   ├─ Border Radius: 8px
   ├─ Font Weight: 500
   ├─ Hover: Background → border color shade
   ├─ Active: Opacity 0.8
   ├─ Disabled: Opacity 0.5
   └─ Icon Space: 8px

3. Tertiary/Text Button
   ├─ Background: Transparent
   ├─ Color: Primary color
   ├─ Border: None
   ├─ Padding: 8px 12px
   ├─ Font Weight: 500
   ├─ Hover: Background → light primary
   ├─ Underline: Optional
   └─ Used for: Links, secondary actions

4. Danger Button
   ├─ Background: Red (#ef4444)
   ├─ Color: White
   ├─ Similar to Primary but red
   └─ Used for: Delete, reject, dangerous actions

5. Ghost Button
   ├─ Background: Transparent
   ├─ Color: Text color
   ├─ Border: 1px solid border
   ├─ Hover: Background light
   └─ Used for: Cancel, secondary negation
```

#### Button Sizes
```
Small (sm):
├─ Height: 32px
├─ Padding: 6px 12px
├─ Font Size: 0.85rem
├─ Icon: 16px
└─ Use: Inline, table actions

Medium (md):
├─ Height: 40px
├─ Padding: 10px 16px
├─ Font Size: 0.9rem
├─ Icon: 20px
└─ Use: Standard, most common

Large (lg):
├─ Height: 48px
├─ Padding: 12px 24px
├─ Font Size: 0.95rem
├─ Icon: 24px
└─ Use: CTAs, forms, primary actions

Extra Large (xl):
├─ Height: 56px
├─ Padding: 14px 28px
├─ Font Size: 1rem
├─ Icon: 28px
└─ Use: Full-width buttons, hero section
```

#### Button States
```
Default: Normal appearance
Hover:   +2px elevation, slight scale
Active:  Darker color, scale 0.98
Focus:   3px solid primary outline
Disabled: 60% opacity, no interactions
Loading: Spinner icon, text hidden/faded
```

---

### INPUT FIELD COMPONENT

#### Text Input Specification
```
Container:
├─ Border: 1px solid border color
├─ Border Radius: 8px
├─ Background: Surface color (#f8fafc)
├─ Min Height: 40px
└─ Padding: 10px 12px

Text:
├─ Font Size: 0.9rem
├─ Color: Primary text
├─ Font Weight: 400
├─ Placeholder: Secondary text, 60% opacity

States:
├─ Default: Normal border
├─ Focus: Primary color border, shadow 0 0 0 3px rgba(primary, 0.1)
├─ Error: Red border, error text below
├─ Disabled: 50% opacity, no interactions
├─ Success: Green border, success icon
└─ Loading: Spinner in right

Label:
├─ Font Size: 0.85rem
├─ Font Weight: 500
├─ Color: Primary text
├─ Margin Bottom: 8px
└─ Required marker: Red asterisk (*)

Helper Text:
├─ Font Size: 0.75rem
├─ Color: Secondary text
├─ Margin Top: 4px
└─ Max width: Input width

Error Message:
├─ Font Size: 0.75rem
├─ Color: Red (#ef4444)
├─ Margin Top: 4px
├─ Icon: ⚠️ or ✗
└─ Display: Below input

Icon Support:
├─ Left Icon: 12px from left edge
├─ Right Icon: 12px from right edge
├─ Icon Size: 20px
├─ Icon Color: Secondary text
└─ Padding adjustment: Add 36px to side with icon
```

#### Input Variants
```
Text Input:    Default
Email Input:   type="email", email validation
Password:      Hidden text, show/hide toggle
Number:        Spinner controls, numeric validation
Phone:         Format mask (+91 XXXXX XXXXX)
Search:        Clear button, search icon
Textarea:      Resizable, min 120px height
Select:        Dropdown with options
Multiselect:   Checkbox-style or tag selection
```

---

### CARD COMPONENT

#### Card Specification
```
Container:
├─ Background: White
├─ Border: 1px solid border color (#e2e8f0)
├─ Border Radius: 12px
├─ Padding: 20px (default) or 16px (compact)
├─ Box Shadow: 0 2px 8px rgba(0,0,0,0.05)
└─ Min Height: 120px (flexible)

Interactive States:
├─ Hover: Border → primary, shadow elevation +1
├─ Active: Border → primary, shadow elevation +2
├─ Focus: Focus outline (3px primary)
└─ Disabled: Opacity 0.6

Content Spacing:
├─ Title + Description: 8px gap
├─ Section Gap: 16px
├─ Element Gap: 12px
└─ Action Gap: 12px

Title:
├─ Font Size: 1rem (16px)
├─ Font Weight: 700
├─ Color: Primary text
└─ Margin Bottom: 8px

Description:
├─ Font Size: 0.9rem
├─ Color: Secondary text
├─ Font Weight: 400
└─ Line Height: 1.5

Subtext:
├─ Font Size: 0.85rem
├─ Color: Secondary text (lighter)
└─ Font Weight: 400

Meta (Right align):
├─ Font Size: 0.8rem
├─ Color: Semantic color (green/red)
├─ Font Weight: 500
└─ Icon Support: Yes

Action Buttons:
├─ Size: Small or Medium
├─ Alignment: Bottom, spread/right
├─ Gap: 8px between
└─ Full width: Optional
```

#### Card Variants
```
Default Card: Standard, hover effects
Flat Card: No border/shadow (for backgrounds)
Elevated Card: Shadow elevation 3-4
Interactive Card: Cursor pointer, stronger hover
Contained Card: Border, background fill
Outlined Card: Border only, no shadow
```

---

### BADGE COMPONENT

#### Badge Specification
```
Container:
├─ Display: inline-block
├─ Padding: 4px 8px (small) or 6px 12px (medium)
├─ Border Radius: 4px or 50% (pill)
├─ Font Size: 0.75rem-0.85rem
├─ Font Weight: 500-700
├─ Height: 20px (default)
└─ Flex: Center alignment

Variants by Color:
├─ Success (Green):    #10b981 bg, white text
├─ Warning (Orange):   #f59e0b bg, white text
├─ Danger (Red):       #ef4444 bg, white text
├─ Info (Blue):        #3b82f6 bg, white text
├─ Primary (Indigo):   #6366f1 bg, white text
├─ Neutral (Gray):     #e2e8f0 bg, #1e293b text
└─ Custom:             Flexible colors

Badge with Icon:
├─ Icon + Text spacing: 4px
├─ Icon Size: 12-14px
└─ Icon Color: Inherit from text

Dismissible Badge:
├─ X icon on right
├─ On click: Remove badge
├─ Cursor: pointer
└─ Icon spacing: 4px

Dot Badge:
├─ 8px dot + text
├─ Indicates status
├─ Colors: success, warning, danger
└─ Use: Online status, activity
```

#### Badge Sizes
```
Small:   4px 8px, 0.75rem font
Medium:  6px 12px, 0.8rem font
Large:   8px 16px, 0.9rem font
```

---

### MODAL/DIALOG COMPONENT

#### Modal Specification
```
Backdrop:
├─ Background: rgba(0, 0, 0, 0.5)
├─ Animation: Fade in (200ms)
├─ Dismissible: Click outside (optional)
└─ Z-index: 1000+

Modal Container:
├─ Background: White
├─ Border Radius: 12px
├─ Box Shadow: 0 20px 40px rgba(0,0,0,0.15)
├─ Width: 90% or max 600px
├─ Max Height: 90vh
├─ Position: Center screen
└─ Animation: Slide up + fade (300ms)

Header:
├─ Padding: 24px
├─ Border Bottom: 1px solid border
├─ Display: Flex, space-between
├─ Title: 1.3rem, 700 weight
└─ Close Button: Top right, primary color on hover

Body:
├─ Padding: 24px
├─ Overflow: Auto (if needed)
├─ Font Size: 0.9rem
└─ Line Height: 1.6

Footer:
├─ Padding: 24px
├─ Border Top: 1px solid border
├─ Display: Flex, justify-end
├─ Button Gap: 12px
└─ Typical: Cancel + Action

Close Button:
├─ Icon: ✕ or similar
├─ Size: 24px × 24px
├─ Hover: Primary color
├─ Keyboard: Escape key
└─ Accessibility: aria-label="Close"
```

#### Modal Types
```
Alert:      Warning/error with action button
Confirm:    Yes/No confirmation
Form:       Input fields with submit
Custom:     Any content
Loading:    Spinner with message
Success:    Confirmation with icon
```

---

## PART 7: RESPONSIVE DESIGN

### Breakpoints
```
Mobile:        < 576px (default)
Tablet Small:  576px - 768px
Tablet:        768px - 1024px
Desktop:       1024px - 1440px
Desktop Large: > 1440px
```

### Responsive Behavior
```
< 576px (Mobile)
├─ Sidebar: Hidden, hamburger menu
├─ Grid: Single column
├─ Cards: Full width
├─ Bottom Navigation: Visible
├─ Font Scale: Reduced slightly
├─ Padding: 12px-16px
├─ Modals: Full screen or bottom sheet
└─ Feature: Simplified for thumbs

576px - 768px (Tablet Small)
├─ Sidebar: Collapsed/hidden
├─ Grid: 2 columns
├─ Cards: 50% width
├─ Font Scale: Normal
├─ Padding: 16px-20px
└─ Modals: Centered

768px - 1024px (Tablet)
├─ Sidebar: Visible (collapse option)
├─ Grid: 2-3 columns
├─ Cards: Responsive
├─ Font Scale: Normal
├─ Padding: 16px-24px
└─ Modals: Centered, max 500px

1024px+ (Desktop)
├─ Sidebar: Always visible
├─ Grid: 3-4+ columns
├─ Cards: Full responsive
├─ Font Scale: Full
├─ Padding: 24px-32px
└─ Modals: Standard
```

### Mobile-Specific Considerations
```
Touch Targets:
├─ Minimum 44px × 44px
├─ Spacing between: 8px
├─ Tap area: No overlaps
└─ Hover states: Optional

Scrolling:
├─ Vertical scrolling: Primary
├─ Horizontal: Limited, sideways swipe
├─ Infinite scroll: Smooth loading
├─ Pull to refresh: Optional

Gestures:
├─ Tap: Select, open
├─ Long press: Context menu
├─ Swipe right: Back
├─ Swipe left: Delete/Archive
└─ Pinch: Zoom (if applicable)

Performance:
├─ Image optimization: Responsive images
├─ Critical CSS: Inline
├─ Lazy loading: Below fold
├─ Max file size: Optimized
└─ Network: Works offline (cache)
```

---

## PART 8: ANIMATIONS & TRANSITIONS

### Transition Timing
```
Fast (100-150ms):     Hover states, opacity, color
Standard (200ms):     Movement, size, shadow
Slow (300-400ms):     Major layout changes, modals
Extra Slow (500+ms):  Page transitions, complex flows
```

### Easing Functions
```
ease-out:     Starts fast, slows down (exit)
ease-in:      Starts slow, speeds up (enter)
ease-in-out:  Smooth throughout
linear:       Constant speed (not recommended)
cubic-bezier: Custom curves
```

### Animation Examples
```
Button Hover:
└─ transform: translateY(-2px), duration: 200ms, ease-out

Card Hover:
└─ box-shadow elevation +1, duration: 200ms, ease-out

Fade In (Page Load):
└─ opacity: 0→1, duration: 300ms, ease-out

Slide In (Sidebar):
└─ transform: translateX(-100%→0), duration: 300ms, ease-out

Pulse (Loading):
└─ opacity: 1→0.6→1, duration: 2s, infinite, ease-in-out

Bounce (Alert):
└─ keyframe animation, 300ms, ease-out
```

### Animation Best Practices
```
✅ DO:
├─ Use GPU-accelerated properties (transform, opacity)
├─ Keep animations under 300ms
├─ Provide disable option for motion-sensitive users
├─ Use ease-out/ease-in-out
└─ Test performance on low-end devices

❌ DON'T:
├─ Animate on scroll heavily
├─ Use too many simultaneous animations
├─ Animate left/top (CPU intensive)
├─ Over-animate (annoying)
└─ Ignore prefers-reduced-motion
```

### Accessibility (Prefers Reduced Motion)
```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## PART 9: DARK MODE

### Dark Mode Color Scheme
```
Background:        #0f172a (almost black)
Surface:           #1e293b (dark slate)
Surface Light:     #334155 (lighter slate)
Border:            #334155 (subtle)
Text Primary:      #f1f5f9 (off white)
Text Secondary:    #cbd5e1 (light gray)
Text Tertiary:     #94a3b8 (muted gray)

Primary:           #818cf8 (lighter indigo for contrast)
Secondary:         #f472b6 (lighter pink)
Success:           #34d399 (lighter green)
Warning:           #fbbf24 (lighter orange)
Danger:            #f87171 (lighter red)
```

### Dark Mode Implementation
```css
:root {
  --bg-primary: #ffffff;
  --bg-surface: #f8fafc;
  --text-primary: #1e293b;
  --border: #e2e8f0;
  /* ... more variables */
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg-primary: #0f172a;
    --bg-surface: #1e293b;
    --text-primary: #f1f5f9;
    --border: #334155;
    /* ... updated variables */
  }
}
```

### Dark Mode Considerations
```
✅ DO:
├─ Use lighter shades of primary colors
├─ Reduce brightness of images
├─ Increase contrast for text
├─ Test readability (WCAG AA)
├─ Provide manual toggle option
└─ Use CSS variables for easy switching

❌ DON'T:
├─ Use pure white text (#ffffff)
├─ Use pure black backgrounds
├─ Forget icons and illustrations
├─ Reduce contrast too much
└─ Make dark mode feel cheap
```

---

## PART 10: ACCESSIBILITY

### WCAG 2.1 AA Compliance Checklist

#### Color & Contrast
```
✓ Contrast Ratio: Minimum 4.5:1 for text
✓ Contrast Ratio: Minimum 3:1 for graphics
✓ Color alone doesn't convey meaning
✓ Status indicators have text/icons too
✓ Links are underlined or otherwise distinct
```

#### Keyboard Navigation
```
✓ All interactive elements: Tab reachable
✓ Tab order: Logical, left to right, top to bottom
✓ Modals: Focus trap enabled
✓ Skip links: Available
✓ No keyboard trap without escape
```

#### Focus Management
```
✓ Focus indicator: Visible (3px outline)
✓ Focus outline: High contrast
✓ Focus style: Distinct from hover
✓ Focus position: Clear on page
✓ First focusable: Interactive element
```

#### Screen Reader Support
```
✓ Semantic HTML: Proper heading hierarchy
✓ Labels: <label> for inputs
✓ ARIA: Used appropriately
✓ Alt text: For all meaningful images
✓ Lists: Proper list markup
✓ Tables: Headers marked
✓ Form validation: Messages announced
✓ Landmarks: Proper structure
```

#### Form Accessibility
```
✓ Labels: Associated with inputs
✓ Required fields: Marked
✓ Error messages: Clear & associated
✓ Placeholders: NOT as labels
✓ Instructions: Before or near input
✓ Input type: Correct (email, tel, etc.)
✓ Autocomplete: Enabled where appropriate
```

#### Motion & Animation
```
✓ Prefers-reduced-motion: Respected
✓ Auto-playing video: Paused by default
✓ Flashing: Nothing > 3 Hz
✓ Animations: Disable option available
```

---

## PART 11: PERFORMANCE OPTIMIZATION

### Image Optimization
```
Format:    WebP for modern browsers, PNG fallback
Sizes:     Mobile (400px), Tablet (800px), Desktop (1200px)
Lazy Load: Below-fold images
Responsive: srcset for different DPIs
Compression: 80% quality for photos, 95% for graphics
```

### CSS Optimization
```
Critical CSS: Inline for above-fold
Non-critical: Defer loading
Framework: Use CSS Grid, Flexbox (native)
Utilities: Purge unused classes
Variables: Reduce file size
```

### JavaScript Optimization
```
Code splitting: By route/feature
Tree shaking: Remove unused code
Minification: Production builds
Async/Defer: Script loading strategy
Lazy components: Load on demand
```

### Network Optimization
```
Compression: Gzip/Brotli enabled
Caching: Browser & server cache
CDN: Distribute static assets
HTTP/2: Push critical resources
```

---

## PART 12: QA CHECKLIST

### Design System QA
```
☐ Colors match specifications
☐ Typography matches sizes & weights
☐ Spacing follows 8px grid
☐ Shadows match elevation levels
☐ Border radius consistent
☐ All states implemented (hover, focus, active, disabled)
☐ Mobile responsive verified
☐ Dark mode functional
☐ Animations smooth (60fps)
☐ Accessibility WCAG AA verified
```

### Component QA
```
☐ Button: All sizes and states working
☐ Input: Validation & error states
☐ Card: Hover effects smooth
☐ Modal: Opening/closing smooth
☐ Badge: All color variants present
☐ Form: Proper labels and error handling
☐ Navigation: Active states working
☐ Notifications: Proper styling
☐ Keyboard: Tab navigation works
☐ Screen reader: Proper ARIA
```

---

## DEPLOYMENT CHECKLIST

- [ ] Design tokens defined
- [ ] Component library built
- [ ] Storybook documentation ready
- [ ] High-fidelity mockups completed
- [ ] Figma design system published
- [ ] Dev handoff specifications ready
- [ ] Accessibility audit passed
- [ ] Performance baseline established
- [ ] Mobile testing completed
- [ ] Cross-browser testing verified

---

## Resources & References

### Design Inspiration
- Linear.app - Modern SaaS design
- Ashby - HR tech design patterns
- HubSpot - Dashboard design
- Notion - Card & sidebar patterns
- Attio - CRM UI patterns

### Tools
- Figma: Design & prototyping
- VS Code: Code editing
- Chrome DevTools: Testing
- Lighthouse: Performance
- Axe DevTools: Accessibility

### Documentation
- WCAG 2.1 Guidelines
- Material Design 3
- Apple HIG (iOS)
- Google Design
- Design System Best Practices

