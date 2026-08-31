import { Check } from "lucide-react";

interface Props {
  currentStep: number;
}

const STEPS = ["Profile", "Goal", "Skills", "Assessment", "Roadmap"];

export default function OnboardingProgress({ currentStep }: Props) {
  return (
    <div className="relative z-10 flex w-full justify-center border-b border-emerald-950/8 bg-[#fffdf7]/65 px-6 py-4 backdrop-blur-xl">
      <div className="max-w-3xl w-full flex items-center justify-between relative">
        <div className="absolute top-4 left-4 right-4 -z-10 h-[2px] rounded-full bg-emerald-950/10" />
        <div
          className="absolute top-4 left-4 -z-10 h-[2px] rounded-full bg-emerald-700 transition-all duration-500 ease-in-out"
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
                    ? "bg-emerald-800 text-amber-50"
                    : isActive
                      ? "border-2 border-emerald-700 bg-emerald-100 text-emerald-800"
                      : "border-2 border-emerald-950/14 bg-[#fffdf7] text-emerald-950/40"
                }`}
              >
                {isPast ? <Check className="w-4 h-4" /> : idx + 1}
              </div>
              <span
                className={`text-xs font-semibold ${
                  isActive ? "text-emerald-800" : isPast ? "text-emerald-900" : "text-emerald-950/42"
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
