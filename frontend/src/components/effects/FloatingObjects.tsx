import { useEffect, useRef, useState } from "react";
import { motion, useAnimationControls } from "framer-motion";

interface FloatingObject {
  id: number;
  x: number;
  y: number;
  size: number;
  color: string;
  rotation: number;
  delay: number;
  duration: number;
  type: "cube" | "sphere" | "torus" | "pyramid" | "ring";
}

const COLORS = [
  "var(--color-accent)",
  "var(--color-purple)",
  "var(--color-pink)",
  "var(--color-success)",
];

function generateObjects(count: number): FloatingObject[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: 20 + Math.random() * 60,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    rotation: Math.random() * 360,
    delay: Math.random() * 5,
    duration: 15 + Math.random() * 20,
    type: (["cube", "sphere", "torus", "pyramid", "ring"] as const)[Math.floor(Math.random() * 5)],
  }));
}

function FloatingShape({ obj, isDark }: { obj: FloatingObject; isDark: boolean }) {
  const controls = useAnimationControls();

  useEffect(() => {
    controls.start({
      x: [0, 100, -50, 80, -30, 0],
      y: [0, -80, 60, -40, 30, 0],
      rotateX: [0, 180, 360],
      rotateY: [0, -180, -360],
      transition: {
        duration: obj.duration,
        repeat: Infinity,
        ease: "linear",
        delay: obj.delay,
      },
    });
  }, [controls, obj.duration, obj.delay]);

  const baseOpacity = isDark ? 0.3 : 0.18;

  const shapeStyles: Record<string, React.CSSProperties> = {
    cube: {
      width: obj.size,
      height: obj.size,
      backgroundColor: obj.color,
      opacity: baseOpacity + 0.05,
      transformStyle: "preserve-3d",
    },
    sphere: {
      width: obj.size,
      height: obj.size,
      backgroundColor: obj.color,
      opacity: baseOpacity,
      borderRadius: "50%",
      boxShadow: isDark
        ? `0 0 ${obj.size / 2}px ${obj.color}40, inset -${obj.size / 4}px -${obj.size / 4}px ${obj.size / 2}px rgba(0,0,0,0.3)`
        : `inset -${obj.size / 4}px -${obj.size / 4}px ${obj.size / 2}px rgba(0,0,0,0.15)`,
    },
    torus: {
      width: obj.size,
      height: obj.size,
      border: `${obj.size / 6}px solid ${obj.color}`,
      opacity: baseOpacity + 0.1,
      borderRadius: "50%",
      boxShadow: isDark ? `0 0 ${obj.size / 3}px ${obj.color}30` : "none",
    },
    pyramid: {
      width: 0,
      height: 0,
      borderLeft: `${obj.size / 2}px solid transparent`,
      borderRight: `${obj.size / 2}px solid transparent`,
      borderBottom: `${obj.size}px solid ${obj.color}`,
      opacity: baseOpacity,
      filter: isDark ? `drop-shadow(0 0 ${obj.size / 3}px ${obj.color}40)` : "none",
    },
    ring: {
      width: obj.size * 1.5,
      height: obj.size * 1.5,
      border: `2px solid ${obj.color}`,
      opacity: baseOpacity + 0.1,
      borderRadius: "50%",
      boxShadow: isDark ? `0 0 ${obj.size / 2}px ${obj.color}30` : "none",
    },
  };

  return (
    <motion.div
      className="absolute pointer-events-none"
      style={{
        left: `${obj.x}%`,
        top: `${obj.y}%`,
        ...shapeStyles[obj.type],
      }}
      animate={controls}
      initial={{ rotate: obj.rotation }}
    />
  );
}

interface Props {
  count?: number;
}

export default function FloatingObjects({ count = 12 }: Props) {
  const objects = useRef(generateObjects(count));
  const [isDark, setIsDark] = useState(() =>
    typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {objects.current.map((obj) => (
        <FloatingShape key={obj.id} obj={obj} isDark={isDark} />
      ))}
    </div>
  );
}
