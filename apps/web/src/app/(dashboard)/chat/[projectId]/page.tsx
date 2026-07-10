'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Send, Zap, Activity, CheckCircle2, ChevronDown } from 'lucide-react';
import { useProjects } from '@/lib/projects/projects-context';
import { EmptyState } from '@/components/ui';

interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
}

export default function ChatPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { getProject, loading } = useProjects();
  const project = getProject(projectId);
  
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'ai',
      content: 'Halo! Saya PAAX Engineering Assistant. Apa yang ingin Anda kerjakan hari ini untuk proyek ini?',
    }
  ]);
  const [input, setInput] = useState('');
  const [selectedModel, setSelectedModel] = useState('Gemini 2.5 Flash');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (loading) return <EmptyState title="Memuat proyek..." />;
  if (!project) return <EmptyState title="Proyek tidak ditemukan" message="Proyek mungkin telah dihapus." />;

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;
    
    const userMessage = input;
    setMessages(prev => [
      ...prev, 
      { id: Date.now().toString(), role: 'user', content: userMessage }
    ]);
    setInput('');
    setIsTyping(true);
    
    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          projectId: projectId,
        }),
      });

      if (!response.ok) {
        throw new Error('Gagal memanggil API chat.');
      }

      const data = await response.json();
      setMessages(prev => [
        ...prev,
        { id: (Date.now() + 1).toString(), role: 'ai', content: data.answer || 'Maaf, terjadi kesalahan saat memproses.' }
      ]);
    } catch (err) {
      setMessages(prev => [
        ...prev,
        { id: (Date.now() + 1).toString(), role: 'ai', content: 'Maaf, terjadi kesalahan pada jaringan atau API.' }
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const QuickAction = ({ icon: Icon, label }: { icon: any, label: string }) => (
    <button style={{
      display: 'flex', alignItems: 'center', gap: 6,
      background: 'var(--surface)', border: '1px solid var(--border)',
      padding: '8px 12px', borderRadius: 20, fontSize: 12,
      color: 'var(--text2)', cursor: 'pointer',
      transition: 'all 0.2s',
      whiteSpace: 'nowrap'
    }}
    onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--border-hover)'}
    onMouseOut={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
    onClick={() => setInput(label)}
    >
      <Icon size={14} color="var(--gold)" />
      {label}
    </button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      
      {/* Messages Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 120px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {messages.map((msg) => (
          <div key={msg.id} style={{
            display: 'flex',
            gap: 16,
            maxWidth: '80%',
            alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
            flexDirection: msg.role === 'user' ? 'row-reverse' : 'row'
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
              background: msg.role === 'user' ? 'var(--side-active-bg)' : 'var(--gold)',
              color: msg.role === 'user' ? 'var(--side-active-ink)' : '#000',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: 12
            }}>
              {msg.role === 'user' ? 'ME' : 'AI'}
            </div>
            
            <div style={{
              background: msg.role === 'user' ? 'var(--surface-hover)' : 'transparent',
              padding: msg.role === 'user' ? '12px 16px' : '6px 0',
              borderRadius: 12,
              color: 'var(--text)',
              fontSize: 14,
              lineHeight: 1.6
            }}>
              {msg.content}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer Area */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: 'linear-gradient(to top, var(--bg) 80%, transparent)',
        padding: '24px 24px 24px',
        display: 'flex', flexDirection: 'column', gap: 12,
        alignItems: 'center'
      }}>
        
        {/* Quick Actions */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', maxWidth: '100%', paddingBottom: 4, scrollbarWidth: 'none' }}>
          <QuickAction icon={Zap} label="Extract quantities from drawings" />
          <QuickAction icon={Zap} label="Create daily site report" />
          <QuickAction icon={Zap} label="Compare current progress vs Schedule" />
        </div>

        {/* Input Box */}
        <div style={{
          width: '100%', maxWidth: 800,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: '12px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          boxShadow: '0 4px 24px rgba(0,0,0,0.2)'
        }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ketik instruksi atau pertanyaan Anda ke PAAX..."
            style={{
              width: '100%', background: 'transparent', border: 'none', color: 'var(--text)',
              fontSize: 14, resize: 'none', outline: 'none', minHeight: 44, maxHeight: 200
            }}
            rows={1}
          />
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                style={{
                  appearance: 'none', background: 'var(--bg)', border: '1px solid var(--border)',
                  color: 'var(--text2)', fontSize: 12, padding: '6px 28px 6px 12px', borderRadius: 8,
                  cursor: 'pointer', outline: 'none'
                }}
              >
                <option>Gemini 2.5 Flash</option>
                <option>Gemini 2.5 Pro</option>
                <option>Saya 3.5 Sonnet</option>
              </select>
              <ChevronDown size={14} color="var(--text3)" style={{ position: 'absolute', right: 8, top: 8, pointerEvents: 'none' }} />
            </div>
            
            <button
              onClick={handleSend}
              disabled={!input.trim() || isTyping}
              style={{
                background: input.trim() && !isTyping ? 'var(--text)' : 'var(--surface-hover)',
                color: input.trim() && !isTyping ? 'var(--bg)' : 'var(--text3)',
                border: 'none', borderRadius: 8, padding: '8px 12px',
                cursor: input.trim() && !isTyping ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', gap: 6,
                fontWeight: 600, fontSize: 13,
                transition: 'all 0.2s'
              }}
            >
              <Send size={14} /> {isTyping ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
        
        <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center' }}>
          PAAX AI dapat membuat kesalahan. Harap verifikasi hasil perhitungan ke tim Engineering.
        </div>
      </div>
      
    </div>
  );
}
