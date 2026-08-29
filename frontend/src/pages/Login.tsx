import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { getState, login, signup } from "../api";
import { routeForStage } from "../routing";
import { setAuth } from "../session";

const FEATURES = [
  { icon: "📊", title: "Skill Analysis", desc: "AI identifies exactly what you know and what you need to learn" },
  { icon: "🗺️", title: "Custom Roadmap", desc: "Personalized learning path built around your actual gaps" },
  { icon: "⚡", title: "Adaptive Pace", desc: "Content adjusts to your learning speed and schedule" },
];

function FeatureCard({ feature, index }: { feature: typeof FEATURES[0]; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 + index * 0.15, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="flex items-start gap-3 p-4 rounded-xl bg-surface/50 border border-border/50 backdrop-blur-sm"
    >
      <div className="text-xl mt-0.5">{feature.icon}</div>
      <div>
        <h3 className="text-sm font-semibold mb-0.5">{feature.title}</h3>
        <p className="text-xs text-fg-secondary leading-relaxed">{feature.desc}</p>
      </div>
    </motion.div>
  );
}

function RoadmapPreview() {
  const nodes = [
    { label: "Assess", status: "done" },
    { label: "Learn", status: "active" },
    { label: "Build", status: "pending" },
    { label: "Master", status: "locked" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.8, duration: 0.6 }}
      className="p-4 rounded-xl bg-surface/60 border border-border/50 backdrop-blur-sm"
    >
      <p className="text-xs font-medium text-fg-muted mb-3 uppercase tracking-wider">Your Learning Path</p>
      <div className="flex items-center gap-2">
        {nodes.map((node, i) => (
          <div key={node.label} className="flex items-center gap-2">
            <div className="flex flex-col items-center">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-medium ${
                node.status === "done"
                  ? "bg-success/20 text-success border border-success/30"
                  : node.status === "active"
                  ? "bg-accent/20 text-fg border border-accent/30"
                  : node.status === "pending"
                  ? "bg-bg-secondary text-fg-secondary border border-border"
                  : "bg-bg-secondary text-fg-muted border border-border"
              }`}>
                {node.status === "done" ? "✓" : i + 1}
              </div>
              <span className="text-[10px] text-fg-muted mt-1">{node.label}</span>
            </div>
            {i < nodes.length - 1 && (
              <div className={`w-6 h-px mb-4 ${
                node.status === "done" ? "bg-success/50" : "bg-border"
              }`} />
            )}
          </div>
        ))}
      </div>
    </motion.div>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setSubmitting(true);
    setError(null);
    try {
      const auth = mode === "login" ? await login(username, password) : await signup(username, password);
      setAuth(auth);
      if (mode === "signup") {
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
    <div className="flex min-h-screen items-center justify-center bg-bg px-6 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-accent/5 via-transparent to-purple/5" />
        <div className="absolute top-1/3 right-0 w-96 h-96 bg-accent/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-purple/5 rounded-full blur-3xl" />
      </div>

      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {[...Array(4)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute border border-accent/10 rounded-full"
            style={{
              width: 150 + i * 80,
              height: 150 + i * 80,
              left: "50%",
              top: "50%",
              marginLeft: -(75 + i * 40),
              marginTop: -(75 + i * 40),
            }}
            animate={{ rotate: [0, 360] }}
            transition={{ duration: 30 + i * 10, repeat: Infinity, ease: "linear" }}
          />
        ))}
      </div>

      <div className="w-full max-w-5xl relative z-10 flex flex-col lg:flex-row items-center gap-12">
        <motion.div
          className="flex-1 max-w-lg"
          initial={{ opacity: 0, x: -40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-xs font-medium text-accent uppercase tracking-widest mb-4"
          >
            AI-POWERED LEARNING
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.7 }}
            className="text-4xl lg:text-5xl font-bold tracking-tight leading-tight mb-4"
          >
            Learn what matters.
            <br />
            <span className="text-fg-secondary">Skip what you know.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-fg-secondary text-sm leading-relaxed mb-8 max-w-md"
          >
            LearnPath analyzes your existing skills and creates a personalized roadmap
            that focuses on your actual knowledge gaps — not generic tutorials.
          </motion.p>

          <div className="flex flex-col gap-3 mb-8">
            {FEATURES.map((feature, i) => (
              <FeatureCard key={feature.title} feature={feature} index={i} />
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="flex items-center gap-6 text-xs text-fg-muted"
          >
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-success" />
              <span>80+ courses indexed</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-success" />
              <span>AI-driven assessments</span>
            </div>
          </motion.div>
        </motion.div>

        <motion.div
          className="flex-1 max-w-md w-full"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
        >
          <motion.div
            className="text-center mb-6"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <h2 className="text-xl font-bold tracking-tight mb-1">
              {mode === "login" ? "Welcome back" : "Get started"}
            </h2>
            <p className="text-xs text-fg-secondary">
              {mode === "login" ? "Continue your learning journey" : "Create your account in seconds"}
            </p>
          </motion.div>

          <motion.div
            className="bg-surface border border-border rounded-2xl p-6 shadow-lg shadow-black/5 dark:shadow-black/30"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
          >
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <motion.div
                className="relative"
                animate={focusedField === "username" ? { scale: 1.01 } : { scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
              >
                <label className="block text-[11px] font-medium text-fg-secondary mb-1.5 uppercase tracking-wider">
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onFocus={() => setFocusedField("username")}
                  onBlur={() => setFocusedField(null)}
                  placeholder="Enter your username"
                  autoComplete="username"
                  className="w-full px-4 py-3 rounded-lg border border-border bg-bg text-fg text-sm
                    outline-none transition-all duration-200
                    focus:border-accent focus:ring-1 focus:ring-accent/20
                    placeholder:text-fg-muted"
                />
              </motion.div>

              <motion.div
                className="relative"
                animate={focusedField === "password" ? { scale: 1.01 } : { scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
              >
                <label className="block text-[11px] font-medium text-fg-secondary mb-1.5 uppercase tracking-wider">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocusedField("password")}
                  onBlur={() => setFocusedField(null)}
                  placeholder="Enter your password"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  className="w-full px-4 py-3 rounded-lg border border-border bg-bg text-fg text-sm
                    outline-none transition-all duration-200
                    focus:border-accent focus:ring-1 focus:ring-accent/20
                    placeholder:text-fg-muted"
                />
              </motion.div>

              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-danger/10 border border-danger/20 text-danger text-xs"
                  >
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.button
                type="submit"
                disabled={submitting || !username.trim() || !password}
                whileHover={{ scale: submitting ? 1 : 1.01 }}
                whileTap={{ scale: submitting ? 1 : 0.99 }}
                className="w-full py-3 rounded-lg font-semibold text-sm
                  bg-fg text-white dark:bg-accent dark:text-[#0A0A0A]
                  hover:bg-fg/90 dark:hover:bg-accent-dark
                  disabled:opacity-40 disabled:cursor-not-allowed
                  transition-all duration-150"
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <motion.span
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full dark:border-[#0A0A0A]/30 dark:border-t-[#0A0A0A]"
                    />
                    Please wait...
                  </span>
                ) : mode === "login" ? "Log in" : "Sign up"}
              </motion.button>
            </form>

            <div className="mt-4 pt-4 border-t border-border">
              <motion.button
                onClick={() => {
                  setMode(mode === "login" ? "signup" : "login");
                  setError(null);
                }}
                whileHover={{ scale: 1.01 }}
                className="w-full py-2.5 rounded-lg text-xs font-medium
                  text-fg-secondary hover:text-fg
                  hover:bg-bg-secondary
                  transition-all duration-200"
              >
                {mode === "login" ? (
                  <span>New here? <span className="text-accent font-semibold">Create account</span></span>
                ) : (
                  <span>Already have an account? <span className="text-accent font-semibold">Log in</span></span>
                )}
              </motion.button>
            </div>
          </motion.div>

          <RoadmapPreview />
        </motion.div>
      </div>
    </div>
  );
}
