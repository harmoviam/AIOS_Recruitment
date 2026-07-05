# AIOS Recruitment - Quick Reference Guide

## Design Specs at a Glance

---

## 🎨 COLOR PALETTE

### Primary
- **Indigo**: #6366f1 (99, 102, 241) - Main actions
- **Pink**: #ec4899 (236, 72, 153) - Accents
- **Gradient**: 135deg linear-gradient(#6366f1 → #ec4899)

### Semantic
- **Success**: #10b981 (Green)
- **Warning**: #f59e0b (Orange)
- **Danger**: #ef4444 (Red)
- **Info**: #3b82f6 (Blue)

### Neutral
- **White**: #ffffff
- **Surface**: #f8fafc (Light background)
- **Border**: #e2e8f0 (Subtle divider)
- **Text Primary**: #1e293b (Dark text)
- **Text Secondary**: #64748b (Muted text)

---

## ✍️ TYPOGRAPHY

### Font Stack
```
-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu
```

### Sizes & Weights
| Scale | Size | Weight | Usage |
|-------|------|--------|-------|
| H1 | 2rem (32px) | 700 | Page titles |
| H2 | 1.5rem (24px) | 700 | Section heads |
| H3 | 1.25rem (20px) | 700 | Subsections |
| H4 | 1rem (16px) | 600 | Labels |
| Body | 0.9rem (14px) | 400 | Text content |
| Small | 0.85rem (13px) | 400 | Secondary info |
| Caption | 0.8rem (12px) | 500 | Meta info |

---

## 📏 SPACING

### 8px Grid System
- **4px**: Micro gaps
- **8px**: Component gaps
- **12px**: Small sections
- **16px**: Standard spacing
- **24px**: Medium sections
- **32px**: Large sections
- **48px**: Major sections

---

## 🎯 BORDER RADIUS

| Radius | Use Case |
|--------|----------|
| 4px | Badges, small buttons |
| 8px | Inputs, small cards |
| 12px | Cards, modals |
| 16px | Large containers |
| 50% | Circles, pills |

---

## 🌈 SHADOWS

| Level | Shadow | Use |
|-------|--------|-----|
| 0 | None | Flat surfaces |
| 1 | 0 2px 8px rgba(0,0,0,0.05) | Cards |
| 2 | 0 4px 12px rgba(0,0,0,0.08) | Hover cards |
| 3 | 0 8px 16px rgba(0,0,0,0.12) | Floating items |
| 4 | 0 12px 24px rgba(0,0,0,0.15) | Modals |

---

## 🔘 BUTTON STYLES

### Primary Button
```
Background: Gradient (Indigo → Pink)
Color: White
Padding: 10px 16px
Border Radius: 8px
Font Weight: 600
Hover: Y-translate(-2px), Shadow +1
```

### Secondary Button
```
Background: Surface (#f8fafc)
Color: Text Primary
Border: 1px solid Border
Padding: 10px 16px
Border Radius: 8px
Font Weight: 500
```

### Button Sizes
- Small (sm): 32px height, 6px 12px padding
- Medium (md): 40px height, 10px 16px padding
- Large (lg): 48px height, 12px 24px padding

---

## 📝 INPUT FIELDS

### Standard Input
```
Border: 1px solid Border (#e2e8f0)
Border Radius: 8px
Background: Surface (#f8fafc)
Padding: 10px 12px
Font Size: 0.9rem
Height: 40px
Focus: Primary border + shadow
```

### States
- **Default**: Normal appearance
- **Focus**: Primary border, 3px shadow
- **Error**: Red border (#ef4444)
- **Success**: Green border (#10b981)
- **Disabled**: 50% opacity

---

## 🎴 CARD COMPONENT

### Standard Card
```
Background: White (#ffffff)
Border: 1px solid Border (#e2e8f0)
Border Radius: 12px
Padding: 20px
Shadow: 0 2px 8px rgba(0,0,0,0.05)
Hover: Border → Primary, Shadow +1
```

### Content Spacing
- Title to description: 8px
- Sections: 16px
- Elements: 12px

---

## 📱 RESPONSIVE BREAKPOINTS

| Breakpoint | Screen | Sidebar | Grid |
|------------|--------|---------|------|
| < 576px | Mobile | Hidden | 1 col |
| 576-768px | Tablet S | Collapsed | 2 col |
| 768-1024px | Tablet | Visible | 2-3 col |
| 1024px+ | Desktop | Visible | 3-4 col |

---

## ⌨️ INTERACTIONS

### Hover Effects
- Cards: Border color change + shadow elevation
- Buttons: Y-translate(-2px) + shadow
- Duration: 200ms ease-out

### Focus States
- Outline: 3px solid Primary (#6366f1)
- Offset: 2px

### Active States
- Scale: 0.98
- Shadow: Reduced

### Animations
- Default duration: 200-300ms
- Easing: ease-out or ease-in-out
- GPU-accelerated: transform, opacity

---

## ♿ ACCESSIBILITY REQUIREMENTS

- ✅ Color contrast: 4.5:1 minimum
- ✅ Touch targets: 44x44px minimum
- ✅ Keyboard navigation: Full support
- ✅ Screen readers: Proper ARIA
- ✅ Focus indicators: Visible
- ✅ Motion: Respects prefers-reduced-motion

---

## 📐 COMPONENT SPECIFICATIONS

### Sidebar Navigation
- Width: 260px
- Sidebar logo height: 40px
- Nav item height: 40px
- Nav item spacing: 4px
- Padding: 1.5rem 1rem

### Top Bar
- Height: 60px
- Search bar width: Flexible
- Icon size: 32px
- Icon spacing: 12px

### Modal
- Width: 90% or max 600px
- Padding: 24px (header, body, footer)
- Border Radius: 12px
- Position: Centered
- Backdrop: rgba(0, 0, 0, 0.5)

### Kanban Column
- Width: 320px
- Border Radius: 12px
- Padding: 16px
- Gap between cards: 12px

### Badge
- Padding: 4px 8px (small) or 6px 12px (medium)
- Border Radius: 4px
- Font Size: 0.75-0.85rem
- Font Weight: 500-700
- Height: 20px

---

## 🎬 ANIMATION TIMINGS

| Duration | Usage |
|----------|-------|
| 100-150ms | Hover states, opacity |
| 200ms | Movements, size changes |
| 300-400ms | Modal appear, page transitions |
| 500ms+ | Complex animations |

---

## 🌙 DARK MODE

### Dark Color Replacements
| Light | Dark |
|-------|------|
| #ffffff | #0f172a |
| #f8fafc | #1e293b |
| #e2e8f0 | #334155 |
| #1e293b | #f1f5f9 |
| #6366f1 | #818cf8 (lighter) |

---

## 📊 KANBAN BOARD

### Column Structure
- 5-6 columns: Applied, Screening, Interview, Selected, Joined
- Column header: Title + count badge
- Card size: Fixed width (300px), flexible height

### Candidate Card Content
- Name (bold, 0.95rem)
- Skills (2-3 tags, 0.75rem)
- Experience (0.85rem)
- AI Score (gradient text, 0.85rem)

---

## 💬 WHATSAPP INBOX

### Layout
- Left: Conversation list (280px)
- Center: Chat (main)
- Right: AI suggestions (320px, hidden on mobile)

### Message Bubble
- User: Gradient background, white text
- System: Surface background, dark text
- Border Radius: 12px
- Padding: 10px 16px
- Max width: 70%

---

## 📈 ANALYTICS DASHBOARD

### KPI Card
- Title: Secondary text (0.9rem)
- Value: Extra large (2rem)
- Meta: Success/danger indicator (0.85rem)

### Chart Area
- Min height: 300px
- Placeholder with pattern
- Padding: 24px

---

## 🎪 FORM PATTERN

### Standard Form
```
Label (0.85rem, 500 weight)
↓
Input Field (40px height)
↓
Helper Text (0.75rem, secondary)
↓
Error Message (0.75rem, red)
```

### Spacing
- Label to input: 8px
- Input to helper: 4px
- Form group gap: 16px
- Between sections: 24px

---

## 📱 MOBILE NAVIGATION

### Bottom Tab Bar
- Height: 60px
- Icons: 40x40px
- Labels: 0.75rem
- Gap: Evenly distributed
- Items: 4-5 total

### Tab Icons
- Dashboard: 📊
- Pipeline: 🎯
- Messages: 💬
- Profile: 👤

---

## 🔐 STATES & VARIATIONS

### Button States
- Default: Normal
- Hover: Scale/shadow change
- Active: Darker shade
- Focus: Outline
- Disabled: 60% opacity
- Loading: Spinner visible

### Form States
- Default: Normal border
- Focus: Primary border, shadow
- Error: Red border, error message
- Success: Green border, success icon
- Disabled: 50% opacity

### Card States
- Default: Border, shadow
- Hover: Lift effect
- Active: Primary border
- Disabled: 50% opacity
- Loading: Skeleton or spinner

---

## 🎯 INTERACTION PATTERNS

### Drag & Drop
- Visual feedback: Outline highlight
- Drop zone: 2px dashed border
- Animation: 200ms smooth
- Cursor: grab/grabbing

### Search & Filter
- Real-time results
- Filter chips (removable)
- Clear all button
- Active filter indication

### Modal
- Backdrop: Fade in 200ms
- Modal: Slide up 300ms
- Close: Button + Escape key
- Focus trap: Enabled

---

## ✅ CHECKLIST FOR IMPLEMENTATION

### Design Tokens
- [ ] Colors defined as variables
- [ ] Typography scale set
- [ ] Spacing values standardized
- [ ] Shadow definitions created
- [ ] Border radius presets configured

### Components
- [ ] Buttons (all variants)
- [ ] Forms (all input types)
- [ ] Cards (standard, interactive)
- [ ] Modals (types and sizes)
- [ ] Navigation (sidebar, tabs)

### Pages
- [ ] Login page
- [ ] Dashboard
- [ ] Pipeline
- [ ] Candidate details
- [ ] Job openings
- [ ] WhatsApp inbox
- [ ] Interview scheduling
- [ ] Analytics
- [ ] Settings

### Responsive
- [ ] Mobile layout
- [ ] Tablet layout
- [ ] Desktop layout
- [ ] Touch interactions
- [ ] Gestures (swipe, pinch)

### Accessibility
- [ ] Color contrast (4.5:1)
- [ ] Keyboard navigation
- [ ] Screen reader support
- [ ] Focus indicators
- [ ] ARIA labels

### Performance
- [ ] Image optimization
- [ ] CSS minification
- [ ] JavaScript bundling
- [ ] Lazy loading
- [ ] Caching strategy

---

## 📚 File References

- **All Wireframes**: `index.html`
- **Detailed Specs**: `WIREFRAME_DOCUMENTATION.md`
- **User Flows**: `USER_FLOWS_AND_NAVIGATION.md`
- **AI Features**: `AI_ASSISTANT_CONCEPTS.md`
- **Design System**: `DESIGN_SYSTEM.md`
- **Project Overview**: `README.md`

---

## 🚀 Quick Start

1. Open `index.html` in browser
2. Review all 9 desktop wireframes
3. Check 5 mobile variations
4. Read `README.md` for overview
5. Study `DESIGN_SYSTEM.md` for implementation
6. Begin high-fidelity mockups in Figma

---

## 📞 Key Contacts & Resources

### Design References
- Linear.app - Minimal SaaS
- Ashby - HR tech
- HubSpot - Dashboards
- Notion - Cards/Sidebars

### Tools
- Figma (design)
- VS Code (development)
- Storybook (components)
- Lighthouse (performance)

### Documentation
- WCAG 2.1 Guidelines
- Material Design 3
- Apple HIG
- Google Design System

---

**Version**: 1.0
**Date**: May 21, 2026
**Status**: Production Ready

