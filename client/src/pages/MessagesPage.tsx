import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import type { Conversation, Message } from '../types';

export default function MessagesPage() {
  const [searchParams] = useSearchParams();
  const initialCandidate = searchParams.get('candidate');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(
    initialCandidate ? Number(initialCandidate) : null
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [draft, setDraft] = useState('');

  const loadConversations = () => api.getConversations().then(setConversations);

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    api.getMessages(selectedId).then(setMessages);
    api.getMessageSuggestions(selectedId).then((r) => setSuggestions(r.suggestions));
  }, [selectedId]);

  const send = async (content: string) => {
    if (!selectedId || !content.trim()) return;
    const msg = await api.sendMessage(selectedId, content.trim());
    setMessages((prev) => [...prev, msg]);
    setDraft('');
    loadConversations();
    api.getMessageSuggestions(selectedId).then((r) => setSuggestions(r.suggestions));
  };

  const selected = conversations.find((c) => c.id === selectedId);

  return (
    <>
      <div className="topbar">
        <div className="search-bar">WhatsApp Shared Inbox</div>
      </div>
      <div className="page-content" style={{ padding: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div className="messaging-layout" style={{ flex: 1, minHeight: 520 }}>
          <div className="conversation-list">
            <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              CONVERSATIONS
            </div>
            {conversations.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`conversation-item${selectedId === c.id ? ' active' : ''}`}
                onClick={() => setSelectedId(c.id)}
              >
                <div className="conversation-name">{c.name}</div>
                <div className="conversation-preview">{c.last_message || 'No messages'}</div>
              </button>
            ))}
          </div>

          <div className="chat-panel">
            {selected ? (
              <>
                <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 700 }}>{selected.name}</div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{selected.phone || 'Online'}</div>
                </div>
                <div className="chat-messages">
                  {messages.map((m) => (
                    <div key={m.id} className={`message${m.is_outgoing ? ' sent' : ''}`}>
                      <div className="message-bubble">{m.content}</div>
                    </div>
                  ))}
                </div>
                <div className="chat-input">
                  <input
                    className="input-field"
                    placeholder="Type a message…"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && send(draft)}
                  />
                  <button type="button" className="button-pill button-primary" onClick={() => send(draft)}>
                    ➤
                  </button>
                </div>
              </>
            ) : (
              <div style={{ padding: '2rem', color: 'var(--text-secondary)' }}>Select a conversation</div>
            )}
          </div>

          <div className="ai-suggestions">
            <div style={{ fontWeight: 700, marginBottom: '1rem' }}>AI Suggested Replies</div>
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                className="candidate-card suggestion-clickable"
                style={{ padding: '1rem', marginBottom: '0.75rem', width: '100%', textAlign: 'left' }}
                onClick={() => send(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
