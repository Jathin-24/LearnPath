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
  const entries = Object.entries(skillRadar);
  if (entries.length === 0) {
    return <p className="text-sm text-slate-500">No skills assessed yet.</p>;
  }

  const data = entries.map(([concept, status]) => ({
    concept,
    value: STATUS_VALUE[status] ?? 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <RadarChart data={data}>
        <PolarGrid stroke="#334155" />
        <PolarAngleAxis dataKey="concept" tick={{ fill: "#94a3b8", fontSize: 11 }} />
        <Radar dataKey="value" stroke="#94a3b8" fill="#94a3b8" fillOpacity={0.4} />
      </RadarChart>
    </ResponsiveContainer>
  );
}
