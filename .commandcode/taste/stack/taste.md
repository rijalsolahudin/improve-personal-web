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
- Follows the supplied design reference closely; UI is expected to be a close copy of the design folder. Confidence: 0.75
- Design-system naming: the sticker-style characters are called "Mascot" (not "Sticker"), and `AppIcon` is used for pure icon components. Confidence: 0.65
- Prefers user-facing customization to stay unrestricted/free (e.g. decoration and stickers can be placed anywhere, not limited to preset slots). Confidence: 0.65
