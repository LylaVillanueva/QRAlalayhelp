# UI/UX design specification (preservation-first)

The current QRAlalay design is authoritative for visual treatment. See `docs/design/UI_DESIGN_BASELINE.md` for exact palette, typography, spacing, components and inventory.

## Interaction principles

- Preserve current branding, colors, font family, layouts, role-specific screens and assets.
- Put Help on welcome/guest entry before authentication; present Call Barangay and Call 911 as separate, clearly labeled actions.
- Never imply that a dialer opening means a call connected or help arrived.
- Use assistance/reunification language; avoid implying professional dispatch or guaranteed rescue.
- Use explicit labels/icons with color, readable status and timestamps/source for location.
- Keep QR scanning separate from submission; clearly confirm only after durable registration.
- Handle network failure with accurate retry/uncertain wording; do not discard entered data silently.
- Preserve user accessibility text size and language settings; audit English and Filipino strings and TalkBack focus/labels.

## Verification

Compare screenshots using synthetic fixtures before/after each UI migration. No screenshots were captured for the current baseline; schedule this when an emulator/device can run. New contact/help components must reuse current tokens and shared controls.
