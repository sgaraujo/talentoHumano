import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { getStorage } from 'firebase/storage';

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
export const storage = getStorage(app);

// En desarrollo, usar proxy de Vite para evitar CORS
if (import.meta.env.DEV) {
  connectFunctionsEmulator(functions, "localhost", 5174);
}