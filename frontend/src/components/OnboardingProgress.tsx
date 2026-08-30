import { Check } from "lucide-react";

interface Props {
  currentStep: number;
}

const STEPS = ["Profile", "Goal", "Skills", "Assessment", "Roadmap"];

export default function OnboardingProgress({ currentStep }: Props) {
  return (
    <div className="w-full py-4 px-6 border-b border-slate-800 bg-slate-800 flex justify-center z-10 relative">
      <div className="max-w-3xl w-full flex items-center justify-between relative">
        <div className="absolute top-4 left-4 right-4 h-[2px] bg-slate-800 -z-10 rounded-full" />
        <div
          className="absolute top-4 left-4 h-[2px] bg-slate-400 -z-10 rounded-full transition-all duration-500 ease-in-out"
          style={{ width: `calc(${(currentStep / (STEPS.length - 1)) * 100}% - 32px)` }}
        />
        {STEPS.map((step, idx) => {
          const isActive = idx === currentStep;
          const isPast = idx < currentStep;
          return (
            <div key={step} className="flex flex-col items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-500 ${
                  isPast
                    ? "bg-slate-100 text-slate-900"
                    : isActive
                      ? "bg-slate-900 border-2 border-slate-400 text-slate-300"
                      : "bg-slate-900 border-2 border-slate-700 text-slate-500"
                }`}
              >
                {isPast ? <Check className="w-4 h-4" /> : idx + 1}
              </div>
              <span
                className={`text-xs font-semibold ${
                  isActive ? "text-slate-300" : isPast ? "text-slate-400" : "text-slate-600"
                }`}
              >
                {step}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
