# CricShield mobile app (Expo / React Native)

Expo SDK 58 · Expo Router · TypeScript. Generated with `create-expo-app --template tabs`, then trimmed:
one tab per component.

| Folder | Screen | Owner | Status |
|--------|--------|-------|--------|
| `app/capture/` | Upload / record video → skeleton overlay | C1 – Nethmi | placeholder |
| `app/reliability/` | Reliability dashboard grouped by body region | C1 – Nethmi | placeholder (hidden tab) |
| `app/features/` | Feature detail with threshold breach indicators | C2 – Samarasinghe | placeholder |
| `app/risk/` | Risk gauge, narrative, two-level SHAP, all factors, history, hand-off to the plan | C3 – Rizma | working |
| `app/plan/` | Recommendation dashboard, why-screen, workload log, profile, history, coach feedback | C4 – Rathnayaka | working |

All calls to the backend go through `src/api/client.ts`, so the API address is set in one place.
Each component adds its own module next to it (`src/api/c4.ts` for C4, `src/api/risk.ts` for C3). Component-specific UI code lives in
`src/<component>/` (e.g. `src/c4/`), so screens can be replaced without touching other members' code.

## Run

```bash
# 1. backend (another terminal) – see backend/README.md
cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 2. app
cd app
npm install
npx expo start            # press w for web, or scan the QR code with Expo Go (SDK 58)
npm run typecheck
```

On a phone the app finds the backend automatically on your PC's IP (same Wi-Fi). If not, set it in
**Plan → Profile & inputs → Server** (e.g. `http://192.168.1.23:8000`). Windows Firewall must allow port 8000.
