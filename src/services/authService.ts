import { httpsCallable } from "firebase/functions";
import { signInWithCustomToken, signOut } from "firebase/auth";
import { auth, functions} from "../config/firebase";


const sendVerificationCodeFn = httpsCallable(functions, "sendVerificationCode");
const verifyEmailCodeAndLoginFn = httpsCallable(functions, "verifyEmailCodeAndLogin");

class AuthService {
  // 1) Enviar código (solo si está autorizado)
  async sendVerificationCode(email: string): Promise<void> {
    await sendVerificationCodeFn({ email });
  }

  // 2) Verificar código e iniciar sesión (custom token)
  async verifyCodeAndLogin(email: string, code: string) {
  const res: any = await verifyEmailCodeAndLoginFn({ email, code });
  const customToken = res?.data?.customToken;

  if (!customToken) throw new Error("No se recibió customToken");

  const userCredential = await signInWithCustomToken(auth, customToken);
  return userCredential.user;
}

  async logout() {
    await signOut(auth);
  }
}

export const authService = new AuthService();
