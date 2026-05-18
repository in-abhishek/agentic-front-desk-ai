'use client';

import { useState, useEffect } from 'react';
import SidebarContext from './components/SidebarContext';
import { useChat } from '@ai-sdk/react';

export default function Home() {
  const [uiState, setUiState] = useState<'INFO' | 'OTP_ALERT' | 'HANDOFF'>('INFO');
  const [userEmail, setUserEmail] = useState('');

  // --- HYBRID FLOW STATE STATE MANAGEMENT ---
  const [chatState, setChatState] = useState<{
    step: 'NEED_NAME' | 'NEED_EMAIL' | 'NEED_OTP' | 'VERIFIED_OR_KNOWN';
    name: string;
    email: string;
  }>({
    step: 'NEED_NAME',
    name: '',
    email: '',
  });

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
  } = useChat({
    api: '/api/chat',
    maxSteps: 5,
    // CRITICAL: Yeh body object har API hit ke sath latest state backend ko bhejega
    body: {
      chatState: chatState,
    },
  });

  useEffect(() => {
    if (!messages || messages.length === 0) return;

    // Last tool invocation result nikalna
    const lastAssistantMessage = [...messages]
      .reverse()
      .find((msg) => msg.role === 'assistant' && msg.toolInvocations);

    if (lastAssistantMessage && lastAssistantMessage.toolInvocations) {
      const invocations = lastAssistantMessage.toolInvocations;
      const lastTool = invocations[invocations.length - 1];

      if (lastTool && lastTool.state === 'result' && lastTool.result) {
        const payload = lastTool.result as any;

        switch (payload.type) {
          // Case 1: AI ne naam extract kar liya
          case 'NAME_EXTRACTED':
            setChatState((prev) => ({
              ...prev,
              step: 'NEED_EMAIL',
              name: payload.extractedName,
            }));
            break;

          // Case 2: Email database mein nahi mila, OTP bheja gaya
          case 'OTP_TRIGGERED_FOR_NEW_USER':
            setUserEmail(payload.email || '');
            setUiState('OTP_ALERT');
            setChatState((prev) => ({
              ...prev,
              step: 'NEED_OTP',
              email: payload.email || '',
            }));
            break;

          // Case 3: Naya user verified ho gaya
          case 'NEW_USER_VERIFIED':
            setUiState('INFO');
            setChatState((prev) => ({
              ...prev,
              step: 'VERIFIED_OR_KNOWN',
            }));
            break;

          // Case 4: Purana user directly database mein mil gaya
          case 'KNOWN_CLIENT':
            setUiState('INFO');
            setChatState((prev) => ({
              ...prev,
              step: 'VERIFIED_OR_KNOWN',
              name: payload.name || prev.name,
              email: payload.email || prev.email,
            }));
            break;

          // Case 5: Human handoff trigger ho gaya
          case 'HANDOFF_TRIGGERED':
            if (payload.email && payload.email.includes('@')) {
              setUserEmail(payload.email);
            } else {
              setUserEmail('');
            }
            setUiState('HANDOFF');
            break;
        }
      }
    }
  }, [messages]);

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
                AI Front Desk Active ({chatState.step})
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

          {messages.map((msg) => {
            if (!msg.content || !msg.content.trim()) return null;

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
                  <p className="whitespace-pre-wrap transition-all duration-300 ease-out">
                    {msg.content}
                  </p>
                </div>
              </div>
            );
          })}

          {isLoading && (
            <div className="flex items-center gap-3 text-slate-400 text-sm animate-pulse">
              <div className="flex gap-1">
                <div className="loader"></div>
              </div>
              Assistant is typing...
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