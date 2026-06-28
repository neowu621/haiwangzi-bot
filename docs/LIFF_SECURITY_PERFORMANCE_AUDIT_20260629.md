# LIFF Security and Performance Audit - 2026-06-29

Version: `20260628_726-C2`
Branch: `codex/liff-security-performance-audit`
Base production version: `20260628_726`

## Summary

This branch reviews the LINE LIFF user flow for the top 10 safety and load-time risks, then applies the low-risk improvements that can be verified without a real LINE WebView session.

The main code changes reduce eager client JavaScript, centralize LIFF SDK loading, fix dependency advisories, add HSTS, and repair seed typings so the production build can be verified.

## Before vs After

| Area | Before | After |
| --- | --- | --- |
| Version | `20260628_726` | `20260628_726-C2` |
| Build verification | Build initially blocked by Prisma seed typing after client generation | `npm run build` passes |
| npm audit | 7 advisories before dependency remediation | 0 vulnerabilities |
| Static JS in `.next/static` | 3865.3 KB | 3812.4 KB |
| Static CSS in `.next/static` | 505.7 KB | 505.7 KB |
| JS file count | 112 | 116, because more code is split into lazy chunks |
| `/liff/booking` tab code | Calendar, tour, and wish tab components imported eagerly | Tab bodies are dynamically imported on demand |
| Signature pad | Included eagerly on booking pages | Loaded only when the booking page needs the signature UI |
| LIFF SDK imports | Multiple direct dynamic imports across client components | Central `loadLiffClient()` memoized loader |
| Security headers | CSP, frame restrictions, content type, referrer, and permissions headers existed | Added `Strict-Transport-Security` |
| Lint gate | `npm run lint` failed because ESLint 9 had no flat config | Added `eslint.config.mjs`; lint now exits 0 with existing warnings |

## Top 10 Checks

1. Server-side LINE token verification: verified in `src/lib/auth.ts`; LIFF ID tokens are verified with LINE and checked against channel/client configuration.
2. LIFF SDK loading: improved with `src/lib/liff/client.ts`, so SDK loading is memoized and isolated behind one import point.
3. Booking page initial JavaScript: improved in `src/app/liff/booking/page.tsx`; non-active tab bodies are split into lazy chunks.
4. Signature pad payload: improved in daily trip and tour booking pages; signature code is no longer part of the eager route import.
5. Dependency advisories: improved by upgrading `@line/liff`, `nodemailer`, and `tsx`; `npm audit --json` reports zero vulnerabilities.
6. Transport security: improved by adding HSTS in `next.config.ts`.
7. Framing/CSP protection: verified in `next.config.ts`; frame ancestors are constrained to self and LINE.
8. LIFF provider scope: verified; `LiffProvider` is attached through the LIFF layout rather than globally for the whole app.
9. Public/shared data caching: verified existing cache/version invalidation helpers for public read-heavy data.
10. Personal data caching: verified existing authenticated fetch paths keep user-specific data uncached/no-store.

## Verification

Passed:

- `npm run db:generate`
- `npm run lint`
- `npm audit --json`
- `npm run build`

Lint note:

- The lint command now runs and exits successfully. Existing React compiler and unused-code findings are kept as warnings so the repository has a usable release gate without hiding the remaining cleanup queue.

## Follow-up Candidates

- Gradually clean up the remaining lint warnings, especially React compiler warnings in admin-heavy pages.
- Consider LINE LIFF pluggable SDK migration in a separate C2 branch after testing in a real LINE WebView.
- Capture real-device WebView metrics for `/liff/booking`, daily booking, and tour booking after deployment.
