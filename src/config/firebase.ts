import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyBnh9P0sI-JeSi-1lO1JDEAs9ty2V0HTf4",
  authDomain: "nelyoda.firebaseapp.com",
  projectId: "nelyoda",
  storageBucket: "nelyoda.firebasestorage.app",
  messagingSenderId: "423942696621",
  appId: "1:423942696621:web:62d2ce1f38dfa08de04b39"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, "us-central1");