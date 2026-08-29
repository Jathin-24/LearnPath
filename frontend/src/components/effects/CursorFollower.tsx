import { useEffect, useState } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

export default function CursorFollower() {
  const cursorX = useMotionValue(-100);
  const cursorY = useMotionValue(-100);
  const trailX = useSpring(cursorX, { damping: 20, stiffness: 180 });
  const trailY = useSpring(cursorY, { damping: 20, stiffness: 180 });
  const [isHovering, setIsHovering] = useState(false);
  const [isClicking, setIsClicking] = useState(false);
  const [cursorVariant, setCursorVariant] = useState<"default" | "text" | "button">("default");
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"));

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      cursorX.set(e.clientX);
      cursorY.set(e.clientY);
    };

    const handleMouseDown = () => setIsClicking(true);
    const handleMouseUp = () => setIsClicking(false);

    const handleHoverStart = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "BUTTON" || target.closest("button") || target.closest("a")) {
        setCursorVariant("button");
        setIsHovering(true);
      } else if (target.tagName === "H1" || target.tagName === "H2" || target.tagName === "H3" || target.closest("h1") || target.closest("h2") || target.closest("h3")) {
        setCursorVariant("text");
        setIsHovering(true);
      }
    };

    const handleHoverEnd = () => {
      setCursorVariant("default");
      setIsHovering(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("mouseover", handleHoverStart);
    document.addEventListener("mouseout", handleHoverEnd);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("mouseover", handleHoverStart);
      document.removeEventListener("mouseout", handleHoverEnd);
    };
  }, [cursorX, cursorY]);

  const variants = isDark
    ? {
        default: {
          width: 10,
          height: 10,
          backgroundColor: "#FFFFFF",
          boxShadow: "0 0 4px rgba(255,255,255,0.7), 0 0 14px rgba(168,230,0,0.9), 0 0 28px rgba(168,230,0,0.45)",
        },
        button: {
          width: 44,
          height: 44,
          backgroundColor: "rgba(168, 230, 0, 0.15)",
          border: "2px solid rgba(168, 230, 0, 0.9)",
          boxShadow: "0 0 25px rgba(168,230,0,0.45)",
        },
        text: {
          width: 50,
          height: 50,
          backgroundColor: "rgba(168, 230, 0, 0.08)",
          border: "1.5px solid rgba(168, 230, 0, 0.6)",
          boxShadow: "0 0 18px rgba(168,230,0,0.3)",
        },
      }
    : {
        default: {
          width: 10,
          height: 10,
          backgroundColor: "#212529",
          boxShadow: "0 0 8px rgba(33,37,41,0.3), 0 0 16px rgba(168,230,0,0.15)",
        },
        button: {
          width: 44,
          height: 44,
          backgroundColor: "rgba(33, 37, 41, 0.08)",
          border: "2px solid rgba(33, 37, 41, 0.6)",
          boxShadow: "0 0 15px rgba(168,230,0,0.15)",
        },
        text: {
          width: 50,
          height: 50,
          backgroundColor: "rgba(33, 37, 41, 0.05)",
          border: "1.5px solid rgba(33, 37, 41, 0.4)",
          boxShadow: "0 0 12px rgba(168,230,0,0.1)",
        },
      };

  return (
    <>
      <motion.div
        className="fixed top-0 left-0 pointer-events-none z-[99999] rounded-full"
        animate={variants[cursorVariant]}
        transition={{ type: "spring", damping: 20, stiffness: 300 }}
        style={{
          x: cursorX,
          y: cursorY,
          translateX: "-50%",
          translateY: "-50%",
        }}
      />
      <motion.div
        className={`fixed top-0 left-0 pointer-events-none z-[99998] rounded-full ${isDark ? "border-accent/60" : "border-fg/30"}`}
        animate={{
          width: isHovering ? 70 : 28,
          height: isHovering ? 70 : 28,
          opacity: isClicking ? 0.4 : 0.6,
        }}
        transition={{ type: "spring", damping: 15, stiffness: 150 }}
        style={{
          x: trailX,
          y: trailY,
          translateX: "-50%",
          translateY: "-50%",
          borderWidth: "1.5px",
          borderStyle: "solid",
        }}
      />
    </>
  );
}
