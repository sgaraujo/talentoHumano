import { useState, useEffect } from "react";
import { type User, onAuthStateChanged } from "firebase/auth";
import { auth } from "../config/firebase";
import { authService } from "../services/authService";

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Escuchar cambios de autenticación
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // 1️⃣ Enviar código de verificación
  const sendCode = async (email: string) => {
    try {
      setLoading(true);
      setError(null);
      await authService.sendVerificationCode(email);
    } catch (err: any) {
      setError(err.message || "Error enviando el código");
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // 2️⃣ Verificar código e iniciar sesión (CUSTOM TOKEN)
  const verifyAndLogin = async (email: string, code: string) => {
    try {
      setLoading(true);
      setError(null);

      // 🔥 UNA sola llamada: backend valida y loguea
      const user = await authService.verifyCodeAndLogin(email, code);

      // `onAuthStateChanged` también lo hará, pero lo seteamos por UX inmediata
      setUser(user);

      return user;
    } catch (err: any) {
      setError(err.message || "Código inválido o expirado");
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // 3️⃣ Cerrar sesión
  const logout = async () => {
    try {
      setLoading(true);
      await authService.logout();
      setUser(null);
    } catch (err: any) {
      setError(err.message || "Error al cerrar sesión");
    } finally {
      setLoading(false);
    }
  };

  return {
    user,
    loading,
    error,
    sendCode,
    verifyAndLogin,
    logout,
    isAuthenticated: !!user,
  };
};
