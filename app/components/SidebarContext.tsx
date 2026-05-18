'use client';

import HandoffForm from './HandoffForm';

interface SidebarProps {
  uiState: 'INFO' | 'OTP_ALERT' | 'HANDOFF';
  userEmail: string;
}

export default function SidebarContext({
  uiState,
  userEmail,
}: SidebarProps) {
  return (
    <div className="h-auto md:h-full bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-6 flex flex-col justify-between border-l border-white/10 overflow-y-auto relative">

      <div className="absolute top-0 right-0 w-72 h-72 bg-cyan-500/10 blur-3xl rounded-full"></div>
      <div className="absolute bottom-0 left-0 w-72 h-72 bg-blue-500/10 blur-3xl rounded-full"></div>

      <div className="relative z-10 h-full flex flex-col justify-around">
        <h2 className="text-sm font-bold uppercase tracking-[0.25em] text-cyan-300/70 mb-6 border-b border-white/10 pb-3 mb-0">
          Workspace Panel
        </h2>

        {uiState === 'INFO' && (
          <div className="space-y-5 animate-[fadeIn_0.5s_ease]">

            <div className="relative overflow-hidden rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/10 to-blue-500/10 backdrop-blur-xl p-5 shadow-[0_0_40px_rgba(34,211,238,0.08)] hover:scale-[1.02] transition duration-300">

              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-pulse"></div>

              <span className="font-bold text-sm block mb-2 text-cyan-200">
                 Today's Live Interest Rates
              </span>

              <p className="text-xs text-slate-300 leading-relaxed">
                Our current home loan rates start from
              </p>

              <b className="text-cyan-300 text-3xl block mt-3 tracking-tight">
                8.40%
              </b>

              <span className="text-xs text-slate-400">
                per annum
              </span>
            </div>

            <div className="bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-3xl p-5 shadow-xl hover:border-cyan-400/20 transition duration-300">

              <span className="font-bold text-sm text-white block mb-4 border-b border-white/10 pb-2">
                 Baseline Checklist
              </span>

              <ul className="space-y-3 text-xs text-slate-300">

                {[
                  'Last 3 Months Payslips',
                  '6 Months Bank Account Statements',
                  'PAN Card & Identity Proofs',
                ].map((item, index) => (
                  <li
                    key={index}
                    className="flex items-center gap-3 hover:translate-x-1 transition duration-200"
                  >
                    <span className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)]"></span>

                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-4 bg-white/[0.03] text-slate-400 text-xs rounded-2xl border border-dashed border-white/10 text-center backdrop-blur-lg">
              Existing clients can query outstanding
              documents directly via chat.
            </div>
          </div>
        )}

        {uiState === 'OTP_ALERT' && (
          <div className="relative overflow-hidden p-6 bg-gradient-to-br from-amber-400/10 to-orange-500/10 text-amber-100 rounded-3xl border border-amber-300/20 shadow-[0_0_35px_rgba(251,191,36,0.15)] space-y-4 animate-pulse">

            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"></div>

            <div className="relative z-10">
              <div className="flex items-center gap-2 text-amber-200 font-bold text-sm">
                <span className="text-lg">🔒</span>
                <span>Security Verification</span>
              </div>

              <p className="text-xs leading-relaxed text-amber-100/80 mt-2">
                A secure 4-digit verification code has
                been dispatched to:
              </p>

              <div className="bg-black/20 backdrop-blur-xl px-4 py-3 rounded-2xl text-center font-mono font-bold text-sm tracking-wider border border-amber-200/20 mt-3 shadow-inner">
                {userEmail || 'your email'}
              </div>

              <p className="text-[11px] text-amber-200/70 italic text-center mt-3">
                Please enter the code inside the chat.
              </p>
            </div>
          </div>
        )}

        {uiState === 'HANDOFF' && (
          <div className="space-y-5 animate-[fadeIn_0.5s_ease]">

            <div className="p-5 bg-gradient-to-br from-emerald-400/10 to-green-500/10 text-emerald-100 text-xs rounded-3xl border border-emerald-300/20 shadow-[0_0_30px_rgba(16,185,129,0.15)] backdrop-blur-xl">

              <span className="font-bold block text-sm mb-2 text-emerald-200">
                Connect to Advisor
              </span>

              <p className="leading-relaxed text-emerald-100/80">
                The AI has initiated a direct human
                handoff. Please supply your contact
                information below.
              </p>
            </div>

            <div className="bg-white/[0.04] border border-white/10 rounded-3xl p-4 backdrop-blur-xl">
              <HandoffForm defaultEmail={userEmail} uiState={uiState} />
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="relative z-10 text-center text-[10px] text-slate-500 font-medium border-t border-white/10 pt-5 mt-6 tracking-widest uppercase">
        AI Assistant By Abhishek
      </div>
    </div>
  );
}