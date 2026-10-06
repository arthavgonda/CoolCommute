# CoolCommute onboarding (Expo · iOS / Android / Web)

Design source: `exploring-skia/blur-cards` (violet→black radial gradient + Blur 100, glass cards r=20,
fill rgba(255,255,255,.1) / stroke .2, the 5-card fan) and `activity-indicator` (sweep-gradient ring).

## Run
    cp .env.example .env      # Cognito pool + API url
    npm install               # postinstall copies canvaskit.wasm to /public for web
    npx expo start            # press i / a / w

## Your Lottie files
Replace the placeholders in `assets/lottie/`: `welcome.json`, `location-ask.json`,
`location-denied.json`, `location-granted.json`.

## Cognito
App client with **no secret**, USER_SRP_AUTH enabled, email sign-up with code verification.

## Backend contract (API Gateway + JWT authorizer on the same pool)
`PUT /profile` (body = profile JSON), `GET /profile`, `DELETE /profile`; header `Authorization: <idToken>`.
Profile JSON is also what is saved locally (`profile.json`, localStorage on web).
