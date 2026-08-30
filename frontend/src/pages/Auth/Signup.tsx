import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, User, Lock, ArrowRight, Loader2 } from "lucide-react";
import { signup, createGuestSession } from "../../api";
import { routeForStage } from "../../routing";
import { useAppState } from "../../context/AppStateContext";

export default function Signup() {
  const navigate = useNavigate();
  const { login: contextLogin } = useAppState();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [guestSubmitting, setGuestSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password || !confirmPassword) return;
    
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const auth = await signup(username, password);
      contextLogin(auth);
      // New users complete required profile fields before anything else.
      navigate("/profile?required=1");
    } catch (err) {
      setError("Couldn't sign up - that username may already be taken.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGuest() {
    setGuestSubmitting(true);
    setError(null);
    try {
      const res = await createGuestSession();
      contextLogin({
        user_id: null,
        username: null,
        session_id: res.session_id,
      });
      navigate(routeForStage(res.state.stage));
    } catch (err) {
      setError("Failed to create a guest session. Please try again.");
    } finally {
      setGuestSubmitting(false);
    }
  }

  const isFormValid = username.trim() && password && confirmPassword;

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="mb-10 text-center animate-fade-in-up">
          <h1 className="text-3xl font-bold tracking-tight text-slate-100 sm:text-4xl">
            Join LearnPath
          </h1>
          <p className="mt-3 text-slate-400">
            Create an account to get started.
          </p>
        </div>

        <div className="glass-panel rounded-2xl p-8 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-400">
                Username
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                  <User className="h-5 w-5 text-slate-500" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Choose a username"
                  autoComplete="username"
                  className="w-full rounded-xl bg-slate-800 border border-slate-700 py-3 pl-11 pr-4 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-slate-400 focus:ring-1 focus:ring-slate-400"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-400">
                Password
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                  <Lock className="h-5 w-5 text-slate-500" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a password"
                  autoComplete="new-password"
                  className="w-full rounded-xl bg-slate-800 border border-slate-700 py-3 pl-11 pr-12 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-slate-400 focus:ring-1 focus:ring-slate-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-4 text-slate-500 hover:text-slate-400 transition"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-400">
                Confirm Password
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                  <Lock className="h-5 w-5 text-slate-500" />
                </div>
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your password"
                  autoComplete="new-password"
                  className="w-full rounded-xl bg-slate-800 border border-slate-700 py-3 pl-11 pr-12 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-slate-400 focus:ring-1 focus:ring-slate-400"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-4 text-slate-500 hover:text-slate-400 transition"
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || guestSubmitting || !isFormValid}
              className="mt-2 group relative flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 px-8 py-3.5 text-sm font-bold text-slate-900 transition-all hover:scale-[1.02] hover:bg-slate-200 hover:shadow-[0_0_20px_rgba(148,163,184,0.4)] disabled:pointer-events-none disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  Sign Up
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 flex items-center">
            <div className="flex-1 border-t border-slate-700"></div>
            <span className="px-4 text-xs uppercase tracking-wider text-slate-500">
              Or
            </span>
            <div className="flex-1 border-t border-slate-700"></div>
          </div>

          <button
            onClick={handleGuest}
            disabled={submitting || guestSubmitting}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/50 px-8 py-3.5 text-sm font-semibold text-slate-400 transition-all hover:bg-slate-700 hover:text-white disabled:pointer-events-none disabled:opacity-50"
          >
            {guestSubmitting ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              "Continue as Guest"
            )}
          </button>
        </div>

        <p className="mt-8 text-center text-sm text-slate-400 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          Already have an account?{" "}
          <Link
            to="/login"
            className="font-semibold text-slate-300 transition hover:text-slate-300 hover:underline"
          >
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
