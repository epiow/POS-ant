// =============================================================================
// Firebase Configuration
// =============================================================================
// SETUP: Replace the placeholder values below with your actual Firebase config.
// 1. Go to https://console.firebase.google.com/
// 2. Select your project → Project Settings (gear icon)
// 3. Scroll to "Your apps" → select the web app (</>)
// 4. Copy the firebaseConfig object and paste below.
// =============================================================================

const firebaseConfig = {
  apiKey: "AIzaSyDIaOUKgA4RqY4-D4-o32rS7RubMobKuP0",
  authDomain: "pos-system-ant.firebaseapp.com",
  projectId: "pos-system-ant",
  storageBucket: "pos-system-ant.firebasestorage.app",
  messagingSenderId: "399381529245",
  appId: "1:399381529245:web:509cafca2ce687149b8a74",
  measurementId: "G-GXTGBDQG5L"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Export instances for use across modules
const db = firebase.firestore();
const auth = firebase.auth();

// Optional: Enable offline persistence (Firestore caches data locally)
db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
  if (err.code === 'failed-precondition') {
    console.warn('Firestore persistence failed: Multiple tabs open.');
  } else if (err.code === 'unimplemented') {
    console.warn('Firestore persistence not available in this browser.');
  }
});
