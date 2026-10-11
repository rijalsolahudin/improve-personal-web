# Taste — Stack & Design

## Platform & framework
- Web/browser app must be built with Nuxt (Vue), not React. Confidence: 0.95
- Native mobile app must be React Native. Confidence: 0.95
- Target platforms are desktop web, native mobile (APK + iOS) and a PWA — multi-device is a hard requirement, including multi-device account/data sync. Confidence: 0.85
- Design-system components should exist for both desktop and mobile ("ui kit desktop sama mobile"). Confidence: 0.7

## Auth & privacy
- No passwords at all: login is email OTP + Google SSO, with the passkey/biometric-style layered unlock as the second factor. Confidence: 0.8
- Demo/dev affordance: outside production the OTP defaults to 777777 so the flow is testable without a backend. Confidence: 0.8
- Strongly values user trust in data safety — wants an end-to-end-encryption story where data stays safe even if a password/key is lost, and key backups in several places, never a single copy. Confidence: 0.75

## Naming & UI
- Follows the supplied design reference closely; UI is expected to be a close copy of the design folder ("niru semirip mungkin") — when a reference design exists, just implement it rather than presenting alternative layouts to choose from. Confidence: 0.85
- Design-system naming: the sticker-style characters are called "Mascot" (not "Sticker"), and `AppIcon` is used for pure icon components. Confidence: 0.65
- Prefers user-facing customization to stay unrestricted/free (e.g. decoration and stickers can be placed anywhere, not limited to preset slots). Confidence: 0.65
- Rejects redundant screens: a feature already covered by an existing page should not get its own separate page (e.g. Jadwal lives inside Kalender), so the design folder — not the PRD/nav registry — defines which screens exist. Confidence: 0.6
- Prefers a minimal UI surface: when something feels crowded or non-essential, cut it entirely rather than leaving it as "maybe useful later" or an optional toggle — pruned the secondary menu items (Panduan, Import/Export, Sticker, Akun & perangkat), hid the decoration UI, and removed the Memo card from the Home page. Confidence: 0.65

## Component architecture
- UI primitives are organized one folder per component with an `index.vue` entry: `components/ui/<Name>/index.vue` (folder-based, not flat `Ui*.vue` files); domain components stay under `components/<domain>/`. Confidence: 0.85
- Wants a comprehensive UI primitive library, not a handful — the `ui/` set should cover all core/display/navigation primitives extracted from the design kit (Button, Card, Chip, Toggle, ProgressBar, SectionHeader, Sheet, etc.) plus shared patterns. Confidence: 0.8
- Primitives are consumed without a name prefix (plain `<Button>`, `<Checkbox>`), configured in `nuxt.config.ts` via `components` with `pathPrefix: false` for the `ui` folder; naming is plain one-word names rather than `Ui`/`Base` prefixed. Confidence: 0.7
- Once a shared primitive exists, expects it adopted exhaustively across the codebase — leftover raw markup (raw `<button>`, duplicate hand-rolled styling) is treated as unfinished work to be swept up, not acceptable residue ("kok masih ada yg blm pake componentnya ya"). Ready to extend a primitive with new variants rather than keep inline CSS for a one-off. Confidence: 0.7

## Styling
- Inputs must not have any extra focus styling: no accent outline/ring/box-shadow on focus — just the element's own base border (and the invalid-state border). Willing to sacrifice keyboard-focus visibility for this. Confidence: 0.7
