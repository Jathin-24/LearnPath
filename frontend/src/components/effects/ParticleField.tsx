import { useCallback, useEffect, useRef, useState } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  decay: number;
  life: number;
  maxLife: number;
  type: "circle" | "square" | "star";
}

const DARK_COLORS = ["#A8E600", "#9775FA", "#FF6B8A", "#34D399", "#FCD34D"];
const LIGHT_COLORS = ["#6B8A00", "#7950F2", "#E11D48", "#059669", "#D97706"];

export default function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const mouse = useRef({ x: 0, y: 0, moving: false });
  const animationFrame = useRef<number>(0);
  const isDark = useRef(document.documentElement.classList.contains("dark"));
  const [blendMode, setBlendMode] = useState<"screen" | "multiply">(isDark.current ? "screen" : "multiply");

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const nowDark = document.documentElement.classList.contains("dark");
      isDark.current = nowDark;
      setBlendMode(nowDark ? "screen" : "multiply");
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const getColors = () => isDark.current ? DARK_COLORS : LIGHT_COLORS;

  const createParticle = useCallback((x: number, y: number, count = 5, spread = "burst") => {
    const colors = getColors();
    for (let i = 0; i < count; i++) {
      let angle: number;
      let speed: number;

      if (spread === "burst") {
        angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
        speed = 2 + Math.random() * 4;
      } else if (spread === "trail") {
        angle = Math.random() * Math.PI * 2;
        speed = 0.5 + Math.random() * 1.5;
      } else {
        angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.5;
        speed = 1 + Math.random() * 2;
      }

      const typeRand = Math.random();
      const type = typeRand < 0.6 ? "circle" : typeRand < 0.85 ? "square" : "star";

      particles.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: (isDark.current ? 2.5 : 2) + Math.random() * 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
        decay: (isDark.current ? 0.008 : 0.01) + Math.random() * (isDark.current ? 0.009 : 0.015),
        life: 0,
        maxLife: (isDark.current ? 90 : 60) + Math.random() * 60,
        type,
      });
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const handleMouseMove = (e: MouseEvent) => {
      mouse.current.x = e.clientX;
      mouse.current.y = e.clientY;
      mouse.current.moving = true;
      if (Math.random() > (isDark.current ? 0.45 : 0.7)) {
        createParticle(e.clientX, e.clientY, isDark.current ? 4 : 2, "trail");
      }
    };

    const handleClick = (e: MouseEvent) => {
      createParticle(e.clientX, e.clientY, 20, "burst");
    };

    const handleScroll = () => {
      const x = Math.random() * window.innerWidth;
      const y = Math.random() * window.innerHeight;
      if (Math.random() > 0.9) {
        createParticle(x, y, 1, "float");
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("click", handleClick);
    window.addEventListener("scroll", handleScroll);

    const drawStar = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number) => {
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
        const px = x + Math.cos(angle) * size;
        const py = y + Math.sin(angle) * size;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.current = particles.current.filter((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.015;
        p.vx *= 0.99;
        p.alpha -= p.decay;
        p.life++;

        if (p.alpha <= 0 || p.life > p.maxLife) return false;

        const progress = p.life / p.maxLife;
        const scale = progress < 0.1 ? progress * 10 : 1;
        const currentSize = p.size * scale;

        ctx.save();
        ctx.globalAlpha = p.alpha * (1 - progress * 0.3);

        if (p.type === "circle") {
          ctx.beginPath();
          ctx.arc(p.x, p.y, currentSize, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.fill();

          ctx.beginPath();
          ctx.arc(p.x, p.y, currentSize * 1.5, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.globalAlpha = p.alpha * 0.15;
          ctx.fill();
        } else if (p.type === "square") {
          ctx.fillStyle = p.color;
          ctx.translate(p.x, p.y);
          ctx.rotate(p.life * 0.05);
          ctx.fillRect(-currentSize / 2, -currentSize / 2, currentSize, currentSize);
        } else {
          ctx.fillStyle = p.color;
          drawStar(ctx, p.x, p.y, currentSize);
          ctx.fill();
        }

        ctx.restore();
        return true;
      });

      animationFrame.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("click", handleClick);
      window.removeEventListener("scroll", handleScroll);
      cancelAnimationFrame(animationFrame.current);
    };
  }, [createParticle]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-[9998]"
      style={{ mixBlendMode: blendMode }}
    />
  );
}
