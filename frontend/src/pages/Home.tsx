import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useScroll, useTransform, useSpring, useMotionValue } from "framer-motion";
import gsap from "gsap";
import { Button } from "../components/nb";
import ThemeToggle from "../components/ThemeToggle";
import { FloatingObjects, MagneticField } from "../components/effects";

const STEPS = [
  { num: "01", title: "UNDERSTAND", body: "Tell us your goal.", icon: "🎯" },
  { num: "02", title: "ASSESS", body: "Show us what you already know.", icon: "📊" },
  { num: "03", title: "ANALYZE", body: "Identify your knowledge gaps.", icon: "🔍" },
  { num: "04", title: "PERSONALIZE", body: "Generate your learning path.", icon: "✨" },
  { num: "05", title: "BUILD", body: "Learn through courses and projects.", icon: "🚀" },
];

const FEATURES = [
  { title: "AI-Powered Analysis", desc: "Real-time skill gap detection", icon: "🧠", color: "var(--color-accent)" },
  { title: "Personalized Paths", desc: "Unique to your knowledge", icon: "🗺️", color: "var(--color-purple)" },
  { title: "Project-Based", desc: "Learn by building real things", icon: "💼", color: "var(--color-pink)" },
  { title: "Adaptive Learning", desc: "Adjusts to your pace", icon: "⚡", color: "var(--color-success)" },
];

function RippleButton({ children, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const btnRef = useRef<HTMLButtonElement>(null);

  const createRipple = (e: React.MouseEvent<HTMLButtonElement>) => {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const ripple = document.createElement("span");
    ripple.className = "ripple-effect";
    ripple.style.left = `${e.clientX - rect.left}px`;
    ripple.style.top = `${e.clientY - rect.top}px`;
    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
  };

  return (
    <button ref={btnRef} className={`relative overflow-hidden ${className}`} onClick={createRipple} {...props}>
      {children}
    </button>
  );
}

function TiltCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [10, -10]), { stiffness: 300, damping: 30 });
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-10, 10]), { stiffness: 300, damping: 30 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    x.set((e.clientX - centerX) / rect.width);
    y.set((e.clientY - centerY) / rect.height);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      ref={cardRef}
      className={`transform-style-3d ${className}`}
      style={{ rotateX, rotateY }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {children}
    </motion.div>
  );
}

function RoadmapPreview() {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const nodes = [
    { label: "HTML", done: true },
    { label: "CSS", done: true },
    { label: "JavaScript", done: true },
    { label: "React", current: true },
    { label: "Node.js" },
    { label: "Final Project", locked: true },
  ];

  return (
    <div className="relative">
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[130%] aspect-square rounded-full bg-gradient-to-br from-accent/25 via-purple/10 to-pink/10 blur-3xl" />
      <div className="relative p-6 rounded-2xl bg-surface border border-border shadow-2xl transform-style-3d">
        <p className="text-xs font-medium uppercase tracking-widest text-fg-muted mb-4">
          FULL-STACK DEVELOPER
        </p>
        <div className="space-y-3">
          {nodes.map((node, i) => (
            <motion.div
              key={node.label}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.8 + i * 0.1 }}
              className="flex items-center gap-3"
              onMouseEnter={() => setHoveredNode(node.label)}
              onMouseLeave={() => setHoveredNode(null)}
            >
              <motion.div
                animate={{
                  scale: hoveredNode === node.label ? 1.5 : 1,
                  boxShadow: hoveredNode === node.label ? "0 0 20px var(--color-accent)" : "0 0 0px transparent",
                }}
                className={`w-3 h-3 rounded-full border-2 transition-colors ${
                  node.done
                    ? "bg-success border-success"
                    : node.current
                    ? "bg-fg border-fg"
                    : node.locked
                    ? "bg-border border-border"
                    : "bg-surface border-border"
                }`}
              />
              <motion.span
                animate={{
                  x: hoveredNode === node.label ? 10 : 0,
                  color: hoveredNode === node.label ? "var(--color-accent)" : "inherit",
                }}
                className={`text-sm transition-colors ${
                  node.current
                    ? "text-fg font-medium"
                    : node.done
                    ? "text-fg-secondary"
                    : node.locked
                    ? "text-fg-muted"
                    : "text-fg-secondary"
                }`}
              >
                {node.label}
                {node.done && <span className="ml-2 text-xs text-success">✓</span>}
                {node.current && (
                  <span className="ml-2 text-xs text-fg-muted">← CURRENT</span>
                )}
              </motion.span>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll();
  const y1 = useTransform(scrollYProgress, [0, 1], [0, -150]);
  const y2 = useTransform(scrollYProgress, [0, 1], [0, -250]);
  const opacity = useTransform(scrollYProgress, [0, 0.3], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.3], [1, 0.95]);

  useEffect(() => {
    if (!heroRef.current) return;

    const cards = heroRef.current.querySelectorAll(".feature-card");
    cards.forEach((card, i) => {
      gsap.fromTo(
        card,
        { rotateY: -20, rotateX: 10, opacity: 0, scale: 0.8 },
        {
          rotateY: 0,
          rotateX: 0,
          opacity: 1,
          scale: 1,
          duration: 1,
          delay: i * 0.2,
          ease: "power3.out",
        }
      );
    });

    const handleScroll = () => {
      const scrolled = window.scrollY;
      if (heroRef.current) {
        heroRef.current.style.setProperty("--scroll", `${scrolled * 0.1}deg`);
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-bg text-fg overflow-hidden relative">
      <div className="noise-overlay" />
      <MagneticField />
      <FloatingObjects count={15} />

      <header className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface/80 backdrop-blur-md sticky top-0 z-50">
        <motion.span
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="text-base font-semibold tracking-tight"
        >
          LearnPath
        </motion.span>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link to="/login">
            <Button variant="secondary" size="sm">Get Started</Button>
          </Link>
        </div>
      </header>

      <section ref={heroRef} className="relative mx-auto max-w-6xl px-6 py-16 md:py-24">
        <div className="absolute inset-0 pointer-events-none">
          <motion.div
            style={{ y: y1 }}
            className="absolute -top-32 -left-24 w-[28rem] h-[28rem] bg-accent/15 dark:bg-accent/20 rounded-full blur-[100px] animate-morph"
          />
          <motion.div
            style={{ y: y2 }}
            className="absolute -top-16 -right-20 w-[22rem] h-[22rem] bg-pink/15 dark:bg-pink/20 rounded-full blur-[90px] animate-morph"
            initial={{ animationDelay: "1.2s" }}
          />
          <motion.div
            className="absolute top-[52%] -left-16 w-[24rem] h-[24rem] bg-purple/15 dark:bg-purple/20 rounded-full blur-[90px] animate-morph"
            initial={{ animationDelay: "2.4s" }}
          />
          <motion.div
            className="absolute -bottom-32 -right-16 w-[26rem] h-[26rem] bg-success/15 dark:bg-success/20 rounded-full blur-[100px] animate-morph"
            initial={{ animationDelay: "3.6s" }}
          />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-radial from-accent/10 dark:from-accent/15 to-transparent rounded-full" />
        </div>

        <motion.div
          style={{ opacity, scale }}
          className="grid gap-12 md:grid-cols-2 items-center relative z-10"
        >
          <motion.div
            initial={{ opacity: 0, x: -80 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.6 }}
              className="text-xs font-medium uppercase tracking-widest text-accent mb-4"
            >
              PERSONALIZED LEARNING ENGINE
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 1, ease: [0.22, 1, 0.36, 1] }}
              className="text-4xl sm:text-5xl lg:text-6xl font-semibold leading-[1.1] tracking-tight"
            >
              BUILD YOUR PATH.
              <br />
              <span className="text-fg-secondary">NOT SOMEONE ELSE'S.</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="mt-6 text-base text-fg-secondary max-w-md leading-relaxed"
            >
              Tell us where you want to go and what you already know. LearnPath identifies your gaps
              and creates a personalized learning path around your actual knowledge.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
              className="mt-8 flex flex-wrap items-center gap-4"
            >
              <Link to="/login">
                <RippleButton className="inline-flex items-center justify-center gap-2 px-7 py-2.5 text-base font-medium rounded-lg bg-fg text-white dark:bg-accent dark:text-[#0A0A0A] hover:bg-fg/90 dark:hover:bg-accent-dark border-2 border-fg dark:border-accent shadow-[2px_2px_0_#171717] dark:shadow-[2px_2px_0_#6B8A00] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] transition-all">
                  BUILD MY ROADMAP <span>→</span>
                </RippleButton>
              </Link>
              <a href="#how-it-works">
                <Button variant="ghost" size="lg">
                  SEE HOW IT WORKS
                </Button>
              </a>
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 80, rotateY: -30 }}
            animate={{ opacity: 1, x: 0, rotateY: 0 }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
            className="flex justify-center perspective-[1200px]"
          >
            <div className="relative w-full max-w-sm">
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[150%] aspect-square rounded-full bg-gradient-to-br from-accent/25 via-purple/15 to-pink/25 dark:from-accent/30 dark:via-purple/20 dark:to-pink/30 blur-3xl animate-morph" />
              <TiltCard className="w-full">
                <RoadmapPreview />
              </TiltCard>
            </div>
          </motion.div>
        </motion.div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8 }}
          className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4"
        >
          {FEATURES.map((feature, i) => (
            <TiltCard key={feature.title}>
              <motion.div
                className="feature-card p-6 rounded-2xl bg-surface border border-border hover:border-accent/50 hover:shadow-lg transition-all duration-300 h-full"
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15, duration: 0.6 }}
                whileHover={{
                  y: -8,
                  boxShadow: `0 20px 40px ${feature.color}20`,
                }}
              >
                <motion.div
                  animate={{
                    y: [-5, 5, -5],
                    rotateZ: [-3, 3, -3],
                  }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: i * 0.5 }}
                  className="text-4xl mb-4"
                >
                  {feature.icon}
                </motion.div>
                <h3 className="font-semibold mb-1">{feature.title}</h3>
                <p className="text-sm text-fg-secondary">{feature.desc}</p>
              </motion.div>
            </TiltCard>
          ))}
        </motion.div>
      </section>

      <section id="how-it-works" className="mx-auto max-w-5xl px-6 pb-20 relative z-10">
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center text-xs font-medium uppercase tracking-widest text-accent mb-10"
        >
          HOW IT WORKS
        </motion.p>
        <div className="space-y-0">
          {STEPS.map((step, i) => (
            <motion.div
              key={step.num}
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ delay: i * 0.1, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-start gap-6 py-6"
            >
              <motion.div
                whileHover={{ scale: 1.2, rotateZ: 10, color: "var(--color-accent)" }}
                whileTap={{ scale: 0.9 }}
                className="text-4xl w-14 h-14 flex items-center justify-center rounded-xl bg-surface border border-border shadow-sm"
              >
                {step.icon}
              </motion.div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold uppercase tracking-wider mb-1">
                  {step.title}
                </h3>
                <p className="text-sm text-fg-secondary">{step.body}</p>
              </div>
              {i < STEPS.length - 1 && (
                <motion.div
                  animate={{ y: [0, 8, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                  className="hidden sm:block text-accent text-xl"
                >
                  ↓
                </motion.div>
              )}
            </motion.div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-20 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="relative bg-surface border border-border rounded-2xl text-center py-16 px-6 overflow-hidden"
        >
          <div className="absolute inset-0 overflow-hidden">
            <motion.div
              animate={{
                backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
              }}
              transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
              className="absolute inset-0 opacity-10"
              style={{
                backgroundImage:
                  "linear-gradient(45deg, var(--color-accent), var(--color-purple), var(--color-pink), var(--color-accent))",
                backgroundSize: "400% 400%",
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-surface via-transparent to-surface" />
          </div>
          <div className="relative z-10">
            <h2 className="text-3xl font-semibold tracking-tight mb-4">
              YOUR SKILLS. YOUR GAPS. YOUR ROADMAP.
            </h2>
            <p className="text-sm text-fg-secondary max-w-lg mx-auto mb-8">
              Stop following generic tutorials. Get a learning path that adapts to what you already know
              and what you actually need to learn next.
            </p>
            <Link to="/login">
              <RippleButton className="inline-flex items-center justify-center gap-2 px-7 py-2.5 text-base font-medium rounded-lg bg-accent text-[#0A0A0A] hover:bg-accent-dark border-2 border-accent-dark shadow-[2px_2px_0_#6B8A00] dark:shadow-[2px_2px_0_#5A7500] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] transition-all">
                START NOW →
              </RippleButton>
            </Link>
          </div>
        </motion.div>
      </section>

      <footer className="border-t border-border bg-surface/80 backdrop-blur-sm px-6 py-6 text-center text-xs text-fg-muted relative z-10">
        Built for a personalized, one-topic-at-a-time learning journey.
      </footer>
    </div>
  );
}
