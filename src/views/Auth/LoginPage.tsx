import { useState, useEffect } from "react";
import { useAuth } from "../../hooks/useAuth";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/config/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation, useNavigate } from "react-router-dom";

export const LoginPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const redirectTo = (location.state as any)?.redirectTo || "/dashboard";

  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [showPasswordLogin, setShowPasswordLogin] = useState(false);
  const [pwError, setPwError] = useState("");

  const { sendCode, verifyAndLogin, loading, error, isAuthenticated } = useAuth();

  // ✅ si ya está autenticado, recién ahí redirige
  useEffect(() => {
    if (isAuthenticated) {
      navigate(redirectTo, { replace: true });
    }
  }, [isAuthenticated, navigate, redirectTo]);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      setPwError(err.message || "Credenciales incorrectas");
    }
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await sendCode(email);
      setStep("code");
    } catch (err) {
      console.error(err);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await verifyAndLogin(email, code);
      // ✅ NO navegues aquí si ya tienes el useEffect arriba
      // si quieres, puedes navegar aquí directamente y quitar el useEffect
      // navigate(redirectTo, { replace: true });
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl text-center">People Analytics</CardTitle>
          <CardDescription className="text-center">
            Sistema de Gestión de Talento Humano
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {showPasswordLogin ? (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              {pwError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-600">{pwError}</p>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="pw-email">Correo electrónico</Label>
                <Input
                  id="pw-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pw-password">Contraseña</Label>
                <Input
                  id="pw-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full">Entrar</Button>
              <Button type="button" variant="link" className="w-full" onClick={() => setShowPasswordLogin(false)}>
                Volver al login con código
              </Button>
            </form>
          ) : step === "email" ? (
            <form onSubmit={handleSendCode} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Correo electrónico</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="tu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Enviando..." : "Enviar código de verificación"}
              </Button>
              <Button type="button" variant="link" className="w-full text-xs text-muted-foreground" onClick={() => setShowPasswordLogin(true)}>
                Iniciar sesión con contraseña
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerifyCode} className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Código enviado a:</Label>
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 text-sm"
                    onClick={() => setStep("email")}
                  >
                    Cambiar email
                  </Button>
                </div>
                <p className="text-sm font-medium">{email}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="code">Código de verificación</Label>
                <Input
                  id="code"
                  type="text"
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  maxLength={6}
                  className="text-center text-2xl tracking-widest"
                  required
                />
                <p className="text-xs text-muted-foreground">El código expira en 10 minutos</p>
              </div>

              <div className="space-y-2">
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Verificando..." : "Verificar código"}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={(e) => handleSendCode(e as any)}
                  disabled={loading}
                >
                  Reenviar código
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
