# CricShield mobile app (Expo / React Native)

The Expo project has not been generated yet. Whoever owns the app shell (agree at the
kickoff) creates it inside this folder with:

```bash
cd app
npx create-expo-app@latest . --template tabs
```

Then keep one screen folder per component:

| Folder | Screen | Owner |
|--------|--------|-------|
| `app/capture/` | Upload / record video → skeleton overlay | C1 – Nethmi |
| `app/reliability/` | Reliability dashboard grouped by body region | C1 – Nethmi |
| `app/features/` | Feature detail with threshold breach indicators | C2 – Samarasinghe |
| `app/risk/` | Risk gauge + SHAP explanation | C3 – Rizma |
| `app/plan/` | Recommendation dashboard + coach feedback form | C4 – Rathnayaka |

All calls to the backend go through `src/api/client.ts`, so the API address is set in one place.
