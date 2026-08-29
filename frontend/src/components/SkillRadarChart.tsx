import { useEffect, useState } from "react";
import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer } from "recharts";
import type { ConceptStatus } from "../types";

const STATUS_VALUE: Record<ConceptStatus, number> = {
  known: 100,
  learned: 100,
  claimed_unconfirmed: 50,
  gap: 10,
};

interface Props {
  skillRadar: Record<string, ConceptStatus>;
}

export default function SkillRadarChart({ skillRadar }: Props) {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"));

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const entries = Object.entries(skillRadar);
  if (entries.length === 0) {
    return <p className="text-sm text-fg-muted">No skills assessed yet.</p>;
  }

  const data = entries.map(([concept, status]) => ({
    concept,
    value: STATUS_VALUE[status] ?? 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <RadarChart data={data}>
        <PolarGrid stroke={isDark ? "#2A2A2A" : "#E2E2DC"} />
        <PolarAngleAxis dataKey="concept" tick={{ fill: isDark ? "#A0A0A0" : "#666666", fontSize: 11 }} />
        <Radar dataKey="value" stroke="#8B7CF6" fill="#8B7CF6" fillOpacity={0.2} />
      </RadarChart>
    </ResponsiveContainer>
  );
}
