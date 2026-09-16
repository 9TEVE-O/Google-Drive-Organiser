import React, { useState } from 'react';
import { HelpCircle } from 'lucide-react';

export default function InfoTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  
  return (
    <div 
      className="relative inline-flex items-center justify-center ml-1.5 z-20 align-top" 
      onMouseEnter={() => setShow(true)} 
      onMouseLeave={() => setShow(false)}
      onClick={() => setShow(!show)} // For mobile tap
    >
      <HelpCircle className="h-3.5 w-3.5 text-slate-400 hover:text-indigo-500 cursor-help transition-colors" strokeWidth={2.5} />
      {show && (
        <div className="absolute z-50 left-1/2 -translate-x-1/2 bottom-full mb-1.5 w-52 p-2.5 text-[11px] font-medium leading-relaxed bg-slate-800 text-white rounded-lg shadow-xl shrink-0 text-center normal-case tracking-normal border border-slate-700 animate-in fade-in zoom-in-95 duration-200">
          {text}
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-800"></div>
        </div>
      )}
    </div>
  );
}
