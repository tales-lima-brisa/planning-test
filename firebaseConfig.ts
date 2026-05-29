/**
 * Firebase Configuration
 * Reads from environment variables (.env file)
 *
 * Get these values from your Firebase Console:
 * https://console.firebase.google.com/
 *
 * 1. Create a new Firebase project
 * 2. Enable Realtime Database
 * 3. Go to Project Settings and copy the values
 * 4. Add them to your .env file with VITE_ prefix
 *
 * See .env.example for the template
 */

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Validate that all required variables are present
const requiredVars = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_DATABASE_URL",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_APP_ID",
];

for (const variable of requiredVars) {
  if (!import.meta.env[variable]) {
    console.warn(
      `[Firebase] Missing environment variable: ${variable}. Check your .env file.`,
    );
  }
}

export default firebaseConfig;
