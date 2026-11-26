# UI design baseline

Status: source-inspected baseline; no screenshots were captured. This is a record of the current implementation, not a redesign proposal.

## Existing design tokens

Source: `QRAlalay-Mobile/theme.js`.

| Token | Current value |
|---|---|
| Primary | `#a83232` |
| Bright primary | `#c12b2b` |
| Secondary | `#245490` |
| Ink | `#1a1a1a` |
| Primary text | `#333` |
| Secondary text | `#666` |
| Muted text | `#777` |
| Placeholder | `#737373` |
| Border | `#ddd` |
| Soft border | `#eee` |
| Surface | `#fff` |
| Sunken surface | `#f2f2f2` |
| Danger ink/background | `#a83232` / `#fbd1d1` |
| Pending ink/background | `#8a6d1d` / `#fbf1a1` |
| Success ink/background | `#288928` / `#a1fbaa` |
| Info ink/background | `#245490` / `#d3e5f8` |
| Form input border | `#ccc` |
| Danger surface | `#ffdcdc` |

Typography uses Poppins (`Poppins_400Regular`, `Poppins_500Medium`, `Poppins_600SemiBold`, `Poppins_700Bold`). Sizes are title 32, section 24, body 18, detail 16, caption 14 logical pixels. Spacing tokens are screen/section/field 24, card 16, control minimum 56. Radius tokens are 8, 10, 12, and 100. Card shadows are intentionally subtle. `statusTone` is the shared semantic status-color mapping.

## Existing structure and reusable components

- Navigation: `QRAlalay-Mobile/component/AppNavigator.js`, React Navigation native stack, role route registry in `lib/screenRegistry.js`.
- Shared UI: `component/AppText.js`, `AppTextInput.js`, `AppPicker.js`, `Avatar.js`, `ScreenState.js`, `ui.js`, `TabBar.js`, role tab buttons, and `ReasonPromptModal.js`.
- Accessibility/preferences: `lib/AccessibilitySettingsContext.js`, `lib/useNotificationPrefs.js`, settings screens, `lib/translations.js`.
- Brand assets: existing `assets/` icons, logo, splash, and profile image. Preserve these files and package identifiers.
- Screens: start/login/permissions; official dashboard, resident enrollment/list/detail, accounts, alert list/detail, assignment, audit, profile/settings; guardian home, ward, alerts, confirmation, emergency help, profile/settings; responder home, assignments, incident report/detail, alerts, profile/settings; shared scanner, legal, accessibility, and confirmation; public QR page in `web/BystanderPublicWeb.js`.

## Preservation and known limitations

The app uses role-specific screens and the established white/red visual identity. New functionality should reuse existing components and token values. The source contains inline styles and duplicated styles in screens; refactor only when needed and retain rendered appearance. Existing text-size settings and language support must remain reachable.

Screenshots were not captured: this audit was performed from source and no simulator/GUI session was started. Visual regressions therefore require a later emulator/device comparison using synthetic records. No screenshot evidence is claimed.

The target design report's illustrative teal/blue direction is not applied because the controlling migration instructions explicitly require preserving the current design.
