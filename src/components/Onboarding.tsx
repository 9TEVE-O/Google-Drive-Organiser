import React, { useState } from 'react';
import { ArrowRight, Sparkles, HardDrive, Bell } from 'lucide-react';

export default function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);

  const steps = [
    {
      title: "1. Organise Your Files",
      description: "We use smart AI to look at your Google Drive and automatically sort your messy files into nice, easy-to-find folders.",
      icon: <Sparkles className="h-12 w-12 text-indigo-500" />
    },
    {
      title: "2. Keep Everything Safe",
      description: "Easily set up automatic copies of your important folders. You'll never lose a document again with our simple backup system.",
      icon: <HardDrive className="h-12 w-12 text-emerald-500" />
    },
    {
      title: "3. Stay on Top of Tasks",
      description: "Set up daily reminders and connect your calendar, so you always know what needs to be done next without stress.",
      icon: <Bell className="h-12 w-12 text-amber-500" />
    }
  ];

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl relative overflow-hidden flex flex-col min-h-[420px]">
        
        {/* Swiping Progress dots */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {steps.map((_, i) => (
            <div 
              key={i} 
              className={`h-2 rounded-full transition-all duration-300 ${i === step ? "w-6 bg-indigo-600" : "w-2 bg-slate-200"}`} 
            />
          ))}
        </div>

        {/* Content Card (Swiping effect simulated via state change) */}
        <div key={step} className="flex-1 flex flex-col items-center justify-center text-center animate-in fade-in slide-in-from-right-4 duration-300">
          <div className="h-24 w-24 bg-slate-50 flex items-center justify-center rounded-3xl mb-6 shadow-sm border border-slate-100">
            {steps[step].icon}
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-3">{steps[step].title}</h2>
          <p className="text-sm text-slate-500 leading-relaxed font-medium">
            {steps[step].description}
          </p>
        </div>

        {/* Action Button */}
        <button 
          onClick={() => {
            if (step < steps.length - 1) {
              setStep(step + 1);
            } else {
              onComplete();
            }
          }}
          className="mt-8 w-full bg-indigo-600 text-white rounded-xl py-3.5 px-4 font-bold text-sm flex items-center justify-center gap-2 hover:bg-indigo-700 transition active:scale-95 shadow-md shadow-indigo-200"
        >
          {step < steps.length - 1 ? "Next" : "Go to your app"} <ArrowRight className="h-4 w-4" />
        </button>

      </div>
    </div>
  );
}
