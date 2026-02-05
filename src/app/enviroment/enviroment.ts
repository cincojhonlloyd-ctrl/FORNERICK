import { initializeApp } from "firebase/app";
import { initializeFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

export const environment = {
  firebase: {
    apiKey: "AIzaSyB_zV9UeCzTLI5YmFl0yeu1G5XAr1qkY0k",
    authDomain: "library-management-syste-3b49e.firebaseapp.com",
    projectId: "library-management-syste-3b49e",
    storageBucket: "library-management-syste-3b49e.firebasestorage.app",
    messagingSenderId: "709077021317",
    appId: "1:709077021317:web:1ba4b9e2f8e19bea8eefec",
    measurementId: "G-D7L5VTZERZ"
  }
};

export const app = initializeApp(environment.firebase);

// Use initializeFirestore with forceLongPolling to avoid connection issues/timeouts
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true
});

export const auth = getAuth(app);
export const storage = getStorage(app);