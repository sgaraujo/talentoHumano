import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyAN_oTLg9fBYMaVgrNo0TprrHkB8V7DcHc",
  authDomain: "nelyoda.firebaseapp.com",
  projectId: "nelyoda",
  storageBucket: "nelyoda.firebasestorage.app",
  messagingSenderId: "881272343488",
  appId: "1:881272343488:web:a92d0871275dbeee071625"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, "us-central1");