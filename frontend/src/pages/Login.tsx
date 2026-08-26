import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getState, login, signup } from "../api";
import { routeForStage } from "../routing";
import { setAuth } from "../session";

export default function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setSubmitting(true);
    setError(null);
    try {
      const auth = mode === "login" ? await login(username, password) : await signup(username, password);
      setAuth(auth);
      if (mode === "signup") {
        // New users complete required profile fields before anything else.
        navigate("/profile?required=1");
        return;
      }
      const { state } = await getState(auth.session_id);
      navigate(routeForStage(state.stage));
    } catch {
      setError(
        mode === "login"
          ? "Couldn't log in - check your username and password."
          : "Couldn't sign up - that username may already be taken.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 text-white">
      <h1 className="text-3xl font-bold">Learn exactly what gets you there.</h1>
      <p className="mt-2 text-slate-400">
        {mode === "login" ? "Log in to pick up where you left off." : "Create an account to get started."}
      </p>

      <form onSubmit={handleSubmit} className="mt-8 flex w-full max-w-sm flex-col gap-3">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          autoComplete="username"
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          placeholder="Password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          type="submit"
          disabled={submitting || !username.trim() || !password}
          className="mt-2 rounded-full bg-indigo-500 px-6 py-2 font-semibold transition hover:bg-indigo-400 disabled:opacity-50"
        >
          {submitting ? "Please wait..." : mode === "login" ? "Log In" : "Sign Up"}
        </button>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </form>

      <button
        onClick={() => {
          setMode(mode === "login" ? "signup" : "login");
          setError(null);
        }}
        className="mt-4 text-sm text-indigo-400 hover:underline"
      >
        {mode === "login" ? "New here? Sign up instead" : "Already have an account? Log in"}
      </button>
    </div>
  );
}
