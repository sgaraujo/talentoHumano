import { useState, useEffect } from "react";
import { useAuth } from "../../hooks/useAuth";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/config/firebase";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocation, useNavigate } from "react-router-dom";
import { Loader2, Mail, Lock, ArrowLeft, Shield } from "lucide-react";

const InteegradosLogo = ({ size = 56 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="lgHex" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#1F8FBF" />
        <stop offset="50%" stopColor="#008C3C" />
        <stop offset="100%" stopColor="#7BCB6A" />
      </linearGradient>
      <linearGradient id="lgBlue" x1="1" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#1F8FBF" />
        <stop offset="100%" stopColor="#5BB3D9" />
      </linearGradient>
      <linearGradient id="lgGreen" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#008C3C" />
        <stop offset="100%" stopColor="#7BCB6A" />
      </linearGradient>
    </defs>
    <path d="M50 4 L91 27 L91 73 L50 96 L9 73 L9 27 Z" fill="url(#lgHex)" opacity="0.92" />
    <path d="M27 70 Q10 46 25 24 Q41 52 27 70Z" fill="url(#lgBlue)" opacity="0.95" />
    <path d="M73 70 Q90 46 75 24 Q59 52 73 70Z" fill="url(#lgGreen)" opacity="0.95" />
    <circle cx="33" cy="30" r="7.5" fill="white" opacity="0.9" />
    <circle cx="50" cy="23" r="9" fill="white" />
    <circle cx="67" cy="30" r="7.5" fill="white" opacity="0.9" />
  </svg>
);

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

  useEffect(() => {
    if (isAuthenticated) navigate(redirectTo, { replace: true });
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
    } catch (err) {
      console.error(err);
    }
  };

  const features = [
    "Analítica de rotación en tiempo real",
    "Seguimiento por empresa y proyecto",
    "Gestión de cuestionarios y onboarding",
    "Reportes de talento humano",
  ];

  return (
    <div className="min-h-screen flex">
      {/* ── LEFT: brand panel ── */}
      <div className="hidden lg:flex lg:w-[45%] bg-gradient-to-b from-[#006330] via-[#008C3C] to-[#005528] flex-col items-center justify-between p-12 relative overflow-hidden">
        {/* Decorative blobs */}
        <div className="absolute top-0 right-0 w-72 h-72 rounded-full bg-white/5 -translate-y-1/3 translate-x-1/3 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-96 h-96 rounded-full bg-white/5 translate-y-1/3 -translate-x-1/3 pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 w-48 h-48 rounded-full bg-[#7BCB6A]/10 -translate-x-1/2 -translate-y-1/2 pointer-events-none" />

        {/* Top: logo + brand */}
        <div className="relative z-10 w-full">
          <div className="flex items-center gap-3">
            <InteegradosLogo size={44} />
            <div>
              <h1 className="text-lg font-bold text-white tracking-widest uppercase leading-none">
                Inte<span className="text-[#7BCB6A] font-extrabold">e</span>grados
              </h1>
              <p className="text-green-300/70 text-xs mt-0.5">Gestión de Talento Humano</p>
            </div>
          </div>
        </div>

        {/* Center: headline */}
        <div className="relative z-10 text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 mb-6">
            <span className="w-2 h-2 rounded-full bg-[#7BCB6A] animate-pulse" />
            <span className="text-green-200 text-xs font-medium">Plataforma activa</span>
          </div>
          <h2 className="text-3xl font-bold text-white leading-snug mb-3">
            Gestiona tu talento<br />
            <span className="text-[#7BCB6A]">con datos reales</span>
          </h2>
          <p className="text-green-200/80 text-sm max-w-xs mx-auto">
            Visualiza, analiza y toma decisiones sobre tu equipo desde un solo lugar.
          </p>

          <div className="mt-8 space-y-3 text-left max-w-xs mx-auto">
            {features.map((f) => (
              <div key={f} className="flex items-center gap-2.5">
                <div className="w-5 h-5 rounded-full bg-[#7BCB6A]/20 border border-[#7BCB6A]/40 flex items-center justify-center flex-shrink-0">
                  <svg className="w-2.5 h-2.5 text-[#7BCB6A]" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <span className="text-green-100 text-sm">{f}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom: copyright */}
        <p className="relative z-10 text-green-300/50 text-xs">
          © {new Date().getFullYear()} Inteegrados
        </p>
      </div>

      {/* ── RIGHT: form panel ── */}
      <div className="w-full lg:w-[55%] flex items-center justify-center p-6 bg-gray-50">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex flex-col items-center mb-8">
            <InteegradosLogo size={52} />
            <h1 className="text-xl font-bold text-[#4A4A4A] tracking-widest uppercase mt-3">
              Inte<span className="text-[#008C3C] font-extrabold">e</span>grados
            </h1>
            <p className="text-gray-400 text-xs mt-1">Gestión de Talento Humano</p>
          </div>

          {/* Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            {/* Card header */}
            <div className="mb-7">
              <h2 className="text-xl font-bold text-[#4A4A4A]">
                {showPasswordLogin
                  ? "Iniciar sesión"
                  : step === "email"
                  ? "Bienvenido de vuelta"
                  : "Verificar identidad"}
              </h2>
              <p className="text-sm text-gray-400 mt-1">
                {showPasswordLogin
                  ? "Ingresa tus credenciales de acceso"
                  : step === "email"
                  ? "Ingresa tu correo institucional para continuar"
                  : `Revisá tu bandeja — enviamos un código a ${email}`}
              </p>
            </div>

            {/* Error banner */}
            {(error || pwError) && (
              <div className="mb-5 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
                <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-white text-[10px] font-bold">!</span>
                </div>
                <p className="text-sm text-red-600">{error || pwError}</p>
              </div>
            )}

            {/* ── PASSWORD FORM ── */}
            {showPasswordLogin ? (
              <form onSubmit={handlePasswordLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="pw-email" className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Correo electrónico
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                    <Input
                      id="pw-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="tu@inteegrados.com"
                      className="pl-9 rounded-xl border-gray-200 focus-visible:ring-[#008C3C] focus-visible:border-[#008C3C]"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="pw-password" className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Contraseña
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                    <Input
                      id="pw-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      placeholder="••••••••"
                      className="pl-9 rounded-xl border-gray-200 focus-visible:ring-[#008C3C] focus-visible:border-[#008C3C]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 bg-[#008C3C] hover:bg-[#006C2F] text-white font-semibold rounded-xl transition-colors text-sm mt-2"
                >
                  Entrar
                </button>

                <button
                  type="button"
                  onClick={() => { setShowPasswordLogin(false); setPwError(""); }}
                  className="w-full flex items-center justify-center gap-1.5 text-sm text-gray-400 hover:text-[#008C3C] transition-colors py-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Volver al acceso con código
                </button>
              </form>

            ) : step === "email" ? (
              /* ── EMAIL STEP ── */
              <form onSubmit={handleSendCode} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Correo electrónico
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="tu@inteegrados.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="pl-9 rounded-xl border-gray-200 focus-visible:ring-[#008C3C] focus-visible:border-[#008C3C]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-[#008C3C] hover:bg-[#006C2F] disabled:opacity-60 text-white font-semibold rounded-xl transition-colors text-sm flex items-center justify-center gap-2 mt-1"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? "Enviando código..." : "Enviar código de verificación"}
                </button>

                <div className="flex items-center gap-3 my-1">
                  <div className="flex-1 h-px bg-gray-100" />
                  <span className="text-xs text-gray-400">o</span>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>

                <button
                  type="button"
                  onClick={() => setShowPasswordLogin(true)}
                  className="w-full py-2 border border-gray-200 text-sm text-gray-500 hover:text-[#008C3C] hover:border-[#008C3C] rounded-xl transition-colors"
                >
                  Iniciar sesión con contraseña
                </button>
              </form>

            ) : (
              /* ── CODE STEP ── */
              <form onSubmit={handleVerifyCode} className="space-y-4">
                {/* Email chip */}
                <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 border border-gray-100">
                  <Mail className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span className="text-sm text-[#4A4A4A] font-medium flex-1 truncate">{email}</span>
                  <button
                    type="button"
                    onClick={() => setStep("email")}
                    className="text-xs text-[#008C3C] hover:underline font-medium flex-shrink-0"
                  >
                    Cambiar
                  </button>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="code" className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Código de 6 dígitos
                  </Label>
                  <div className="relative">
                    <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                    <Input
                      id="code"
                      type="text"
                      placeholder="000000"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                      maxLength={6}
                      className="pl-9 text-center text-2xl tracking-[0.6em] font-bold rounded-xl border-gray-200 focus-visible:ring-[#008C3C] focus-visible:border-[#008C3C] h-14"
                      required
                    />
                  </div>
                  <p className="text-xs text-gray-400">El código expira en 10 minutos</p>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-[#008C3C] hover:bg-[#006C2F] disabled:opacity-60 text-white font-semibold rounded-xl transition-colors text-sm flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? "Verificando..." : "Verificar y entrar"}
                </button>

                <button
                  type="button"
                  onClick={(e) => handleSendCode(e as any)}
                  disabled={loading}
                  className="w-full py-2 border border-gray-200 text-sm text-gray-500 hover:text-[#008C3C] hover:border-[#008C3C] rounded-xl transition-colors disabled:opacity-50"
                >
                  Reenviar código
                </button>
              </form>
            )}
          </div>

          <p className="text-center text-xs text-gray-400 mt-6">
            © {new Date().getFullYear()} Inteegrados · Todos los derechos reservados
          </p>
        </div>
      </div>
    </div>
  );
};
