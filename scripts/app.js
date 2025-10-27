// School Flow — Firebase Google Auth (client-side, no bundler)
// Uses Firebase v10 modular SDK from CDN.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "./firebaseConfig.js";

// Basic DOM refs
const els = {
  signIn: document.getElementById("signInBtn"),
  signOut: document.getElementById("signOutBtn"),
  user: document.getElementById("user"),
  userName: document.getElementById("userName"),
  userEmail: document.getElementById("userEmail"),
  userPhoto: document.getElementById("userPhoto"),
  status: document.getElementById("status"),
  setupWarning: document.getElementById("setupWarning"),
};

// Detect placeholder config and nudge the developer
const missingConfig =
  !firebaseConfig ||
  !firebaseConfig.apiKey ||
  String(firebaseConfig.apiKey).includes("YOUR_");
if (missingConfig && els.setupWarning) {
  els.setupWarning.style.display = "block";
}

// Initialize Firebase
let app, auth, provider;
try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  auth.useDeviceLanguage?.();
  provider = new GoogleAuthProvider();
  provider.setCustomParameters?.({ prompt: "select_account" });
  setStatus("Ready. Click \"Continue with Google\" to sign in.");
} catch (err) {
  setStatus("Failed to initialize Firebase. Check your config.", true);
  console.error("Firebase init error:", err);
}

// Wire up UI events
if (els.signIn) {
  els.signIn.addEventListener("click", async () => {
    if (!auth || !provider) return;
    setBusy(true);
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      // Fallback to redirect for popup blockers or mobile
      if (err?.code === "auth/popup-blocked" || err?.code === "auth/cancelled-popup-request") {
        try {
          await signInWithRedirect(auth, provider);
          setStatus("Redirecting to Google Sign-In…");
        } catch (e2) {
          handleAuthError(e2);
        }
      } else {
        handleAuthError(err);
      }
    } finally {
      setBusy(false);
    }
  });
}

if (els.signOut) {
  els.signOut.addEventListener("click", async () => {
    if (!auth) return;
    setBusy(true);
    try {
      await signOut(auth);
      setStatus("Signed out.");
    } catch (err) {
      handleAuthError(err);
    } finally {
      setBusy(false);
    }
  });
}

// React to auth state changes
if (auth) {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      showUser(user);
      els.signIn.style.display = "none";
      els.signOut.style.display = "inline-flex";
      setStatus(`Signed in as ${user.displayName || user.email || "User"}.`, false, true);
    } else {
      hideUser();
      els.signIn.style.display = "inline-flex";
      els.signOut.style.display = "none";
      setStatus("You are signed out.");
    }
  });
}

// UI helpers
function showUser(user) {
  if (!els.user) return;
  const name = user.displayName || "Unnamed";
  const email = user.email || "";
  const photo = user.photoURL || "";
  els.userName.textContent = name;
  els.userEmail.textContent = email;
  if (photo) {
    els.userPhoto.src = photo;
    els.userPhoto.alt = `${name}'s photo`;
  }
  els.user.style.display = "flex";
}

function hideUser() {
  if (!els.user) return;
  els.user.style.display = "none";
}

function setBusy(busy) {
  if (els.signIn) els.signIn.disabled = busy;
  if (els.signOut) els.signOut.disabled = busy;
}

function setStatus(text, isError = false, isSuccess = false) {
  if (!els.status) return;
  els.status.textContent = text || "";
  els.status.style.color = isError ? "var(--danger)" : isSuccess ? "var(--success)" : "var(--muted)";
}

function handleAuthError(err) {
  console.error("Auth error:", err);
  let msg = "Authentication failed.";
  switch (err?.code) {
    case "auth/operation-not-allowed":
      msg = "Google Sign-In is not enabled for this Firebase project.";
      break;
    case "auth/popup-closed-by-user":
      msg = "Popup closed before completing the sign in.";
      break;
    case "auth/network-request-failed":
      msg = "Network error. Check your connection and try again.";
      break;
    case "auth/unauthorized-domain":
      msg = "This domain is not authorized in your Firebase Auth settings.";
      break;
    default:
      msg = err?.message || msg;
  }
  setStatus(msg, true);
}

