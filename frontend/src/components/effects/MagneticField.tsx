import { useEffect, useRef } from "react";

export default function MagneticField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouse = useRef({ x: 0, y: 0 });
  const animationFrame = useRef<number>(0);
  const dots = useRef<Array<{ x: number; y: number; originX: number; originY: number; vx: number; vy: number }>>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initDots();
    };

    const initDots = () => {
      dots.current = [];
      const spacing = 55;
      for (let x = 0; x < canvas.width; x += spacing) {
        for (let y = 0; y < canvas.height; y += spacing) {
          dots.current.push({
            x,
            y,
            originX: x,
            originY: y,
            vx: 0,
            vy: 0,
          });
        }
      }
    };

    resize();
    window.addEventListener("resize", resize);

    const handleMouseMove = (e: MouseEvent) => {
      mouse.current.x = e.clientX;
      mouse.current.y = e.clientY;
    };

    window.addEventListener("mousemove", handleMouseMove);

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const isDark = document.documentElement.classList.contains("dark");

      dots.current.forEach((dot) => {
        const dx = mouse.current.x - dot.x;
        const dy = mouse.current.y - dot.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxDist = 200;

        if (dist < maxDist) {
          const force = (maxDist - dist) / maxDist;
          dot.vx += (dx / dist) * force * 0.35;
          dot.vy += (dy / dist) * force * 0.35;
        }

        dot.vx += (dot.originX - dot.x) * 0.04;
        dot.vy += (dot.originY - dot.y) * 0.04;

        dot.vx *= 0.92;
        dot.vy *= 0.92;

        dot.x += dot.vx;
        dot.y += dot.vy;

        const proximity = Math.min(dist / maxDist, 1);
        let alpha: number;
        let dotSize: number;

        if (isDark) {
          alpha = 0.18 + (1 - proximity) * 0.5;
          dotSize = 2 + (1 - proximity) * 1.5;
        } else {
          alpha = 0.15 + (1 - proximity) * 0.55;
          dotSize = 2.5 + (1 - proximity) * 1.5;
        }

        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dotSize, 0, Math.PI * 2);
        ctx.fillStyle = isDark
          ? `rgba(168, 230, 0, ${alpha})`
          : `rgba(107, 138, 0, ${alpha})`;
        ctx.fill();

        if (proximity < 0.35) {
          ctx.beginPath();
          ctx.arc(dot.x, dot.y, dotSize * 2.5, 0, Math.PI * 2);
          ctx.fillStyle = isDark
            ? `rgba(168, 230, 0, ${alpha * 0.15})`
            : `rgba(168, 230, 0, ${alpha * 0.1})`;
          ctx.fill();
        }
      });

      animationFrame.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(animationFrame.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
    />
  );
}
