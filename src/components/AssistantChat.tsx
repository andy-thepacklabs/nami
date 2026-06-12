'use client'

import { useState, useRef, useEffect } from 'react'
import { MessageCircle, X, Send, RefreshCw } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const SUGGESTIONS = [
  'What are my top selling SKUs?',
  'Which raw materials are low on stock?',
  'How many SKUs are out of stock?',
  'What is my total inventory value?',
]

export default function AssistantChat() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
      if (messages.length === 0) {
        setMessages([{
          role: 'assistant',
          content: "Hi! I'm Nami, your inventory assistant. Ask me anything about your stock levels, top sellers, low stock alerts, or any other inventory data.",
        }])
      }
    }
  }, [open])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const send = async (text?: string) => {
    const content = (text ?? input).trim()
    if (!content || loading) return
    setInput('')

    const newMessages: Message[] = [...messages, { role: 'user', content }]
    setMessages(newMessages)
    setLoading(true)

    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      })
      const data = await res.json()
      if (data.reply) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${data.error ?? 'Unknown error'}` }])
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Connection error. Please try again.' }])
    }
    setLoading(false)
  }

  return (
    <>
      {/* Floating button with hover preview */}
      <div className="fixed bottom-6 right-6 z-50 group">
        {/* Large image tooltip on hover */}
        {!open && (
          <div className="absolute bottom-16 right-0 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-300 scale-90 group-hover:scale-100 origin-bottom-right">
            <div className="rounded-2xl overflow-hidden shadow-2xl shadow-black/60 ring-2 ring-orange-500/40 w-48 h-48">
              <img src="/nami-bg.png" alt="Nami" className="w-full h-full object-cover" />
            </div>
            <div className="text-center mt-1.5">
              <span className="text-xs font-bold text-orange-400 tracking-widest uppercase">Nami</span>
            </div>
          </div>
        )}
        <button
          onClick={() => setOpen(o => !o)}
          className="w-14 h-14 rounded-full bg-orange-500 hover:bg-orange-400 shadow-lg shadow-orange-500/30 flex items-center justify-center transition-all duration-200 hover:scale-105"
        >
          {open
            ? <X className="w-6 h-6 text-white" />
            : <img src="/nami-bg.png" alt="Nami" className="w-10 h-10 rounded-full object-cover" />
          }
        </button>
      </div>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-[400px] h-[560px] bg-[#0d0d0d] border border-orange-900/30 rounded-2xl shadow-2xl shadow-black/60 flex flex-col overflow-hidden">

          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-orange-900/30 bg-[#111] shrink-0">
            <img src="/nami-bg.png" alt="Nami" className="w-8 h-8 rounded-full object-cover ring-1 ring-orange-500/40" />
            <div>
              <div className="text-sm font-bold text-white">Nami</div>
              <div className="text-xs text-white/40">Powered by live inventory data</div>
            </div>
            <button
              onClick={() => setMessages([])}
              className="ml-auto text-white/30 hover:text-white/60 transition-colors"
              title="Clear chat"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex items-end gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'assistant' && (
                  <img src="/nami-bg.png" alt="Nami" className="w-6 h-6 rounded-full object-cover shrink-0 mb-0.5 ring-1 ring-orange-500/30" />
                )}
                <div className={`max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-orange-500/20 text-white rounded-br-sm'
                    : 'bg-white/5 text-white/90 rounded-bl-sm'
                }`}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white/5 rounded-xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Suggestions (only when just greeting shown) */}
          {messages.length === 1 && (
            <div className="px-4 pb-2 flex flex-wrap gap-1.5 shrink-0">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-xs px-2.5 py-1.5 rounded-lg bg-orange-500/10 text-orange-300 hover:bg-orange-500/20 transition-colors border border-orange-500/20"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="px-3 py-3 border-t border-orange-900/30 shrink-0">
            <form onSubmit={e => { e.preventDefault(); send() }} className="flex items-center gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Ask about inventory..."
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-orange-500/50 transition-colors"
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="w-9 h-9 rounded-xl bg-orange-500 hover:bg-orange-400 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors shrink-0"
              >
                <Send className="w-4 h-4 text-white" />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
