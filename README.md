# School Flow — Firebase Google Login (No build tools)

A minimal web login page for School Flow using Firebase Authentication with Google Sign-In. No bundlers required — just a static server.

## Features
- Google Sign-In via Firebase Auth (v10 modular SDK via CDN)
- Popup with graceful fallback to redirect on popup blockers
- Simple, responsive UI with sign-in/out and user details

## Prerequisites
- A Firebase project with a Web App created
- Authentication > Sign-in method: enable Google
- Authentication > Settings: Authorized domains must include `localhost`

## Setup
1. Copy your Firebase Web App config from Firebase Console:
   - Firebase Console > Project settings > Your apps > Web app > SDK setup and configuration
2. Open `scripts/firebaseConfig.js` and replace the placeholder values with your config.

## Run locally
Using Node.js 18+:

```cmd
npm install
npm run start
```
This will start a static server at http://localhost:5173 and open the page.

## Files
- `index.html` — Login page markup and styles
- `scripts/app.js` — UI + Firebase Auth logic
- `scripts/firebaseConfig.js` — Your Firebase web config (placeholder provided)

## Deploy
Because this is a static site, you can deploy the files with any static hosting (Firebase Hosting, Netlify, Vercel, GitHub Pages). Ensure your production domain is added to Firebase Auth > Authorized domains.

## Troubleshooting
- Popup blocked: The app will fall back to redirect flow automatically.
- Unauthorized domain: Add your dev/prod domains in Firebase Auth settings.
- Init error: Double-check `scripts/firebaseConfig.js` values.

