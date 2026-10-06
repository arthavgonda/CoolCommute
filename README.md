# CoolCommute

In most metropolitan cities, heat and pollution are a part of our daily commute. We usually choose routes based on how quickly we can reach our destination, but rarely think about how much heat and polluted air we are exposed to along the way.

That's the problem we wanted to work on with CoolCommute.

The idea is simple: help people find routes where they can avoid as much heat and pollution as possible. We also want to encourage the use of public transport so that fewer private vehicles on the road can mean lower emissions.

CoolCommute is built using **Expo and React Native**, with support for iOS, Android, and web. We use **AWS Cognito** for authentication and **API Gateway** to sync user profiles.

## ✨ Features

- **Cross-platform experience** — One Expo codebase for iOS, Android, and web.
- **Glassmorphism UI** — Translucent cards, soft blur effects, and a violet-to-black gradient aesthetic.
- **Interactive onboarding** — Guided welcome, location-permission, and preference setup flows.
- **Lottie animations** — Animated onboarding states for welcome, granted permissions, and denied permissions.
- **AWS Cognito authentication** — Email-based sign-up, verification, and authentication using a public app client.
- **Profile synchronization** — Fetch, update, and delete user profiles through API Gateway.
- **Local persistence** — Save profile data locally and support profile access across app sessions.
- **Location-aware preferences** — Store user location coordinates when available.

## Design

The goal was to build a UI that looks clean, feels modern, and is easy to navigate. We wanted the onboarding to be simple and smooth across iOS, Android, and web, without making it feel cluttered or overwhelming.

## Tech Stack

| Technology | Purpose |
|---|---|
| React Native | Cross-platform UI |
| Expo | Development and platform tooling |
| React Native Skia | Custom graphics and visual effects |
| Lottie | Onboarding animations |
| AWS Cognito | User authentication |
| Amazon API Gateway | Backend API access |
| Local storage | Persistent profile data |

## Project Structure

```text
CoolCommute/
├── assets/
│   └── lottie/
│       ├── welcome.json
│       ├── location-ask.json
│       ├── location-denied.json
│       └── location-granted.json
├── public/
│   └── canvaskit.wasm
├── .env.example
├── package.json
└── README.md
```

*The structure above highlights the key configuration and asset locations; additional application directories may exist in the repository.*

## Getting Started

### Prerequisites

- Node.js and npm
- Expo-compatible development environment
- AWS Cognito User Pool and app client
- API Gateway endpoint connected to your backend

### 1. Clone the repository

```bash
git clone <YOUR_REPOSITORY_URL>
cd CoolCommute
```

### 2. Configure environment variables

Create your local environment file:

```bash
cp .env.example .env
```

Configure the following variables:

```env
EXPO_PUBLIC_COGNITO_USER_POOL_ID=your_user_pool_id
EXPO_PUBLIC_COGNITO_CLIENT_ID=your_app_client_id
EXPO_PUBLIC_API_URL=https://your-api-id.execute-api.us-east-1.amazonaws.com
```

Use an API URL without a trailing slash if your client appends endpoint paths directly.

**Security note:** Expo public environment variables are bundled into client applications. Never place AWS secret access keys, Cognito app client secrets, or other private credentials in `EXPO_PUBLIC_*` variables.

### 3. Install dependencies

```bash
npm install
```

The project uses a post-install step to copy `canvaskit.wasm` into `public/` for web support. Ensure the corresponding script and required package are configured in `package.json`.

### 4. Start the development server

```bash
npx expo start
```

Use the Expo terminal shortcuts:

- Press `i` to open the iOS simulator.
- Press `a` to open the Android emulator.
- Press `w` to launch the web app.

## Authentication

CoolCommute uses Amazon Cognito for user authentication.

Configure the Cognito app client with:

- **Client secret:** Disabled.
- **Authentication flow:** `USER_SRP_AUTH` enabled.
- **Sign-in identifier:** Email.
- **Sign-up verification:** Email verification code.

The app uses the Cognito ID token when calling protected profile endpoints. The API Gateway JWT authorizer must be configured for the corresponding Cognito User Pool and token claims.

## Backend Integration

The app communicates with an API Gateway HTTP API backed by your server-side integration.

### Profile endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/profile` | Retrieve the authenticated user's profile |
| `PUT` | `/profile` | Create or update the user's profile |
| `DELETE` | `/profile` | Delete the user's remote profile |

Protected requests use the following authorization header:

```http
Authorization: <Cognito-ID-Token>
Content-Type: application/json
```

The API must validate the token and associate profile data with the authenticated user's identity.

### Profile data model

```json
{
  "airSensitivity": "medium",
  "heatAvoidance": "medium",
  "tradeoff": "balanced",
  "location": {
    "lat": 30.27,
    "lng": 78.05
  },
  "completedAt": "2026-10-06T09:22:26.560Z",
  "synced": true
}
```

The example illustrates the profile format; actual values depend on user selections and location permissions.

| Field | Description |
|---|---|
| `airSensitivity` | User's sensitivity to air pollution |
| `heatAvoidance` | User's preference for avoiding heat |
| `tradeoff` | Preference for `time`, `exposure`, or `balanced` routing |
| `location` | Latitude and longitude, when available |
| `completedAt` | Timestamp indicating onboarding completion |
| `synced` | Local synchronization status |

The profile JSON is also used for local persistence, with platform-appropriate storage such as `profile.json` or browser `localStorage`, according to the project's storage implementation.

## Lottie Assets

Replace the placeholder animations in `assets/lottie/` with your final animations:

| File | Purpose |
|---|---|
| `welcome.json` | Welcome and onboarding introduction |
| `location-ask.json` | Location-permission explanation |
| `location-denied.json` | Location access denied state |
| `location-granted.json` | Location access granted state |

Ensure the animation files are valid Lottie JSON assets and are compatible with the animation library used by the app.

## Platform Support

| Platform | Development |
|---|---|
| iOS | Expo iOS simulator or compatible device |
| Android | Expo Android emulator or compatible device |
| Web | Browser through Expo |

Some graphics and blur effects may require platform-specific testing or adjustments to maintain consistent rendering.

## Troubleshooting

**Profile synchronization fails**

- Verify `EXPO_PUBLIC_API_URL`.
- Confirm the API Gateway routes and Lambda integration are configured correctly.
- Check that the Cognito ID token is valid and the JWT authorizer uses the correct issuer and audience.
- Verify backend permissions for any required database operations.

**CORS errors on web**

- Add the development origin, such as `http://localhost:8081`, to the API's allowed origins.
- Allow `GET`, `POST`, `PUT`, `DELETE`, and `OPTIONS` as needed.
- Allow the `Authorization` and `Content-Type` headers.
- Ensure the API is deployed and the requested route exists. A `404` response can accompany a misleading browser CORS error.

**Web graphics or animations fail**

- Verify the CanvasKit asset is copied to `public/`.
- Check the post-install script and package dependencies.
- Test the animation and blur effects separately on each target platform.

---

**CoolCommute** — Making personalized, climate-aware commuting easier, one journey at a time.
