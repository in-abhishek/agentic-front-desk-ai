'use client';

import { useState } from 'react';
import SidebarContext from './components/SidebarContext';
import SmoothTypewriter from './components/SmoothTypewriter';
import { useChat } from '@ai-sdk/react';

interface SlotState {
  user_type: 'KNOWN' | 'UNKNOWN' | null;
  client_name: string | null;
  is_otp_verified: boolean;
  pending_action: 'SHOW_STATUS' | 'SHARE_LOAN_LINK' | 'HUMAN_HANDOFF' | 'VERIFY_OTP' | null;
  email: string | null;
  phone: string | null;
}

export default function Home() {
  const [uiState, setUiState] = useState<'INFO' | 'OTP_ALERT' | 'HANDOFF'>('INFO');
  const [userEmail, setUserEmail] = useState('');

  const [sessionSlots, setSessionSlots] = useState<SlotState>({
    user_type: null,
    client_name: null,
    is_otp_verified: false,
    pending_action: null,
    email: null,
    phone: null,
  });

  const {
    messages,
    setMessages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
  } = useChat({
    api: '/api/chat',
    body: {
      sessionSlots: sessionSlots,
    },
    onResponse: async (response) => {
      try {
        const clonedResponse = response.clone();
        const data = await clonedResponse.json();
        
        // Append the incoming message text cleanly
        if (data && data.reply) {
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(),
              role: 'assistant',
              content: data.reply,
              createdAt: new Date(),
            },
          ]);
        }

        // Synchronize engine slot parameters
        if (data && data.slots) {
          const freshSlots: SlotState = data.slots;
          setSessionSlots(freshSlots);

          if (freshSlots.email) {
            setUserEmail(freshSlots.email);
          }

          // Strict mapping layout states
          if (freshSlots.pending_action === 'HUMAN_HANDOFF') {
            setUiState('HANDOFF');
          } 
          else if (freshSlots.pending_action === 'VERIFY_OTP') { 
            setUiState('OTP_ALERT');
          } 
          else {
            setUiState('INFO');
          }
        }
      } catch (err) {
        console.error("Error capturing backend payload:", err);
      }
    }
  });

  return (
    <div className="flex flex-col md:flex-row md:h-dvh w-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 font-sans md:overflow-hidden text-white">
      {/* Left Chat Section */}
      <div className="w-full md:w-2/3 flex flex-col max-md:h-dvh h-full backdrop-blur-xl bg-white/5 border-r border-white/10">

        {/* Header */}
        <div className="px-4 py-4 md:p-5 border-b border-white/10 flex items-center justify-between bg-black/20 backdrop-blur-xl sticky top-0 z-10">
          <div>
            <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent tracking-tight">
              Smart Home Loans
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-ping"></span>
              <span className="text-xs text-slate-300 font-medium tracking-wide">
                AI Front Desk Active ({sessionSlots.pending_action || 'IDLE'})
              </span>
            </div>
          </div>
        </div>

        {/* Chat Window */}
        <div className="flex-1 overflow-y-auto px-3 py-4 md:p-6 space-y-5 bg-gradient-to-b from-transparent to-black/10 custom-scroll">
          {messages.length === 0 && (
            <div className="text-center text-slate-300 text-sm h-full my-auto flex justify-center items-center">
              <div className='p-6 border border-white/10 rounded-2xl max-w-md mx-auto bg-white/5 backdrop-blur-lg shadow-2xl animate-fadeIn'>
                Hello and Welcome! Please share your{' '}
                <b className="text-cyan-300">Loan Query</b>.
              </div>
            </div>
          )}

          {messages.map((msg, index) => {
            if (!msg.content || !msg.content.trim()) return null;

            // Check if this particular assistant bubble is the newest one in the array
            const isLatestAssistantMessage = 
              msg.role === 'assistant' && 
              index === messages.findLastIndex((m) => m.role === 'assistant');

            return (
              <div
                key={msg.id}
                className={`flex animate-in fade-in slide-in-from-bottom-2 duration-300 ${
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`max-w-[90%] sm:max-w-[80%] md:max-w-[75%] p-4 rounded-3xl shadow-2xl border text-sm leading-relaxed transition-all duration-300 hover:scale-[1.01] ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white border-cyan-400/20 rounded-tr-md flex justify-start gap-4 items-center'
                      : 'bg-white/10 backdrop-blur-xl text-slate-100 border-white/10 rounded-tl-md'
                  }`}
                >
                  <span className={`block text-[10px] font-bold tracking-[0.2em] uppercase opacity-60 ${msg.role === 'user' ? 'mb-0' : 'mb-2'}`}>
                    {msg.role === 'user' ? (
                      <span className="flex items-center justify-center w-8 h-8 rounded-full bg-white/20 border border-white/20 backdrop-blur-md shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" className="w-4 h-4 fill-white">
                          <path d="M320 312C386.3 312 440 258.3 440 192C440 125.7 386.3 72 320 72C253.7 72 200 125.7 200 192C200 258.3 253.7 312 320 312zM290.3 368C191.8 368 112 447.8 112 546.3C112 562.7 125.3 576 141.7 576L498.3 576C514.7 576 528 562.7 528 546.3C528 447.8 448.2 368 349.7 368L290.3 368z"></path>
                        </svg>
                      </span>
                    ) : 'Desk Assistant'}
                  </span>
                  
                  <div className="text-slate-100">
                    {isLatestAssistantMessage ? (
                      // Smooth typewriter presentation for new arrivals
                      <SmoothTypewriter text={msg.content} speed={15} />
                    ) : (
                      // Instant text rendering for history logs
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {isLoading && (
            <div className="flex items-center gap-3 text-slate-400 text-sm animate-pulse">
              <div className="loader"></div>
              Assistant is processing...
            </div>
          )}
        </div>

        {/* Input Bar */}
        <form onSubmit={handleSubmit} className="p-3 md:p-5 border-t border-white/10 bg-black/20 backdrop-blur-xl">
          <div className="flex gap-2 md:gap-3 max-w-4xl mx-auto">
            <input
              value={input}
              onChange={handleInputChange}
              placeholder="Type your message..."
              className="flex-1 bg-white/10 backdrop-blur-xl border border-white/10 rounded-2xl px-4 py-3 md:px-5 md:py-4 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-400 transition-all duration-300 shadow-inner"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 md:px-7 py-3 md:py-4 rounded-2xl text-sm font-semibold transition-all duration-300 shadow-xl hover:scale-105 active:scale-95"
            >
              Send
            </button>
          </div>
        </form>
      </div>

      {/* Sidebar */}
      <div className="w-full md:w-1/3 h-auto md:h-full bg-black/20 backdrop-blur-xl border-t md:border-t-0 md:border-l border-white/10">
        <SidebarContext uiState={uiState} userEmail={userEmail} />
      </div>
    </div>
  );
}