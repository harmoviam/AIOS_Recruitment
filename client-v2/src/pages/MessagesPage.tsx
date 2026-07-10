import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import type { Candidate, Conversation, Message, MessagingIntegrationStatus } from '../types';
import { STAGES } from '../types';

function relativeTime(iso?: string) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function stageLabel(stage: string) {
  return STAGES.find((s) => s.id === stage)?.label ?? stage;
}

function waStatusLabel(status?: Message['wa_status']) {
  switch (status) {
    case 'sent':
      return 'Delivered to WhatsApp';
    case 'simulated':
      return 'Saved locally (simulated)';
    case 'failed':
      return 'WhatsApp delivery failed';
    default:
      return null;
  }
}

function waStatusClass(status?: Message['wa_status']) {
  switch (status) {
    case 'sent':
      return 'wa-status-sent';
    case 'simulated':
      return 'wa-status-simulated';
    case 'failed':
      return 'wa-status-failed';
    default:
      return '';
  }
}

function backLabelFrom(path: string) {
  if (path.startsWith('/candidates/')) return 'Candidate profile';
  if (path === '/candidates') return 'Candidates';
  if (path === '/follow-ups') return 'Follow-ups';
  if (path === '/pipeline') return 'Pipeline';
  return 'previous page';
}

export default function MessagesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialCandidate = searchParams.get('candidate');
  const returnTo = searchParams.get('from');
  const hasDeepLink = Boolean(initialCandidate);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(
    initialCandidate ? Number(initialCandidate) : null
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  // Deep links (e.g. Follow-up Center templates) can prefill the composer.
  const [draft, setDraft] = useState(searchParams.get('draft') ?? '');
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [sending, setSending] = useState(false);
  const [integration, setIntegration] = useState<MessagingIntegrationStatus | null>(null);
  const [lastSendError, setLastSendError] = useState<string | null>(null);

  // New-conversation picker
  const [showPicker, setShowPicker] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [pickerSearch, setPickerSearch] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadConversations = () => api.getConversations().then(setConversations);

  useEffect(() => {
    loadConversations();
    api.getMessagingIntegrationStatus().then(setIntegration).catch(() => setIntegration(null));
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      setSuggestions([]);
      setLastSendError(null);
      return;
    }
    api.getMessages(selectedId).then(setMessages);
    api.getMessageSuggestions(selectedId).then((r) => setSuggestions(r.suggestions));
  }, [selectedId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async (content: string) => {
    if (!selectedId || !content.trim() || sending) return;
    setSending(true);
    setLastSendError(null);
    try {
      const msg = await api.sendMessage(selectedId, content.trim());
      const waStatus = msg.wa_status as Message['wa_status'] | undefined;
      setMessages((prev) => [
        ...prev,
        {
          ...msg,
          wa_status: waStatus,
          wa_error: msg.wa_error,
        },
      ]);
      if (waStatus === 'failed') {
        setLastSendError(msg.wa_error || 'Message was saved but WhatsApp delivery failed.');
      }
      setDraft('');
      loadConversations();
      const r = await api.getMessageSuggestions(selectedId);
      setSuggestions(r.suggestions);
    } finally {
      setSending(false);
    }
  };

  const openPicker = () => {
    setShowPicker(true);
    if (candidates.length === 0) api.getCandidates().then(setCandidates);
  };

  const startConversation = (candidateId: number) => {
    setShowPicker(false);
    setPickerSearch('');
    setSelectedId(candidateId);
  };

  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => {
      if (stageFilter !== 'all' && c.stage !== stageFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          (c.last_message || '').toLowerCase().includes(q) ||
          (c.phone || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [conversations, stageFilter, search]);

  const totalUnread = useMemo(
    () => conversations.reduce((s, c) => s + (c.unread_hint || 0), 0),
    [conversations]
  );

  const selected =
    conversations.find((c) => c.id === selectedId) ||
    (selectedId
      ? candidates.find((c) => c.id === selectedId) &&
        ({ id: selectedId, name: candidates.find((c) => c.id === selectedId)!.name, phone: candidates.find((c) => c.id === selectedId)!.phone, stage: candidates.find((c) => c.id === selectedId)!.stage } as Conversation)
      : null);

  const pickerCandidates = candidates.filter((c) =>
    pickerSearch.trim() ? c.name.toLowerCase().includes(pickerSearch.toLowerCase()) : true
  );

  const goBack = () => {
    if (returnTo) {
      navigate(returnTo);
    } else if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/candidates');
    }
  };

  return (
    <>
      <div className="topbar">
        {hasDeepLink && (
          <button type="button" className="button-pill button-secondary" onClick={goBack}>
            ← Back{returnTo ? ` to ${backLabelFrom(returnTo)}` : ''}
          </button>
        )}
        <div className="search-bar">
          WhatsApp Shared Inbox
          {integration && (
            <span
              className={`inbox-mode-pill${integration.mode === 'live' ? ' inbox-mode-live' : ''}`}
              title={
                integration.mode === 'live'
                  ? 'Messages are sent via Meta WhatsApp API'
                  : 'Simulated mode — configure .env to go live'
              }
            >
              {integration.mode === 'live' ? 'Live' : 'Simulated'}
            </span>
          )}
          {totalUnread > 0 && <span className="inbox-unread-total">{totalUnread} new</span>}
        </div>
        <button type="button" className="button-pill button-primary" onClick={openPicker}>
          + New chat
        </button>
      </div>
      <div className="page-content" style={{ padding: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div className={`messaging-layout${selected ? ' has-active' : ''}`} style={{ flex: 1, minHeight: 0 }}>
          <div className="conversation-list">
            <div className="conversation-list-tools">
              <input
                className="input-field"
                placeholder="Search conversations…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select className="input-field" value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
                <option value="all">All stages</option>
                {STAGES.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </div>
            {filteredConversations.length === 0 ? (
              <p className="empty-inline" style={{ padding: '1rem 0' }}>No conversations found.</p>
            ) : (
              filteredConversations.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`conversation-item${selectedId === c.id ? ' active' : ''}`}
                  onClick={() => setSelectedId(c.id)}
                >
                  <div className="conversation-item-head">
                    <div className="conversation-name">{c.name}</div>
                    <span className="conversation-time">{relativeTime(c.last_message_at)}</span>
                  </div>
                  <div className="conversation-preview">{c.last_message || 'No messages yet'}</div>
                  <div className="conversation-meta">
                    <span className="conversation-stage">{stageLabel(c.stage)}</span>
                    {(c.unread_hint || 0) > 0 && <span className="conversation-unread">{c.unread_hint}</span>}
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="chat-panel">
            {selected ? (
              <>
                <div className="chat-header">
                  <button type="button" className="chat-back" onClick={() => setSelectedId(null)}>
                    ← All conversations
                  </button>
                  <div className="chat-header-info">
                    <div>
                      <div style={{ fontWeight: 700 }}>{selected.name}</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {selected.phone || 'No phone on file'}
                      </div>
                    </div>
                    <span className="conversation-stage">{stageLabel(selected.stage)}</span>
                  </div>
                </div>
                <div className="chat-messages">
                  {messages.length === 0 && (
                    <p className="empty-inline">No messages yet. Send the first message below.</p>
                  )}
                  {messages.map((m) => {
                    const statusLabel = m.is_outgoing ? waStatusLabel(m.wa_status) : null;
                    return (
                      <div key={m.id} className={`message${m.is_outgoing ? ' sent' : ''}`}>
                        <div className="message-bubble">
                          {m.content}
                          <span className="message-time">{relativeTime(m.sent_at)}</span>
                          {statusLabel && (
                            <span className={`message-wa-status ${waStatusClass(m.wa_status)}`}>
                              {statusLabel}
                              {m.wa_error ? ` — ${m.wa_error}` : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
                <div className="chat-input">
                  {lastSendError && (
                    <div className="chat-send-error" role="alert">
                      {lastSendError}
                    </div>
                  )}
                  {integration?.mode === 'simulated' && (
                    <p className="chat-simulated-hint">
                      Simulated mode — message is saved in the inbox only until WhatsApp env vars are set on the server.
                    </p>
                  )}
                  <textarea
                    className="input-field"
                    placeholder="Type a message…"
                    rows={draft.includes('\n') ? 6 : 1}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        send(draft);
                      }
                    }}
                  />
                  <button type="button" className="button-pill button-primary" onClick={() => send(draft)} disabled={sending} aria-label="Send">
                    ➤
                  </button>
                </div>
              </>
            ) : (
              <div className="empty-inline">Select a conversation to start chatting</div>
            )}
          </div>

          <div className="ai-suggestions">
            <div className="ai-suggestions-title" style={{ fontWeight: 700, marginBottom: '1rem' }}>
              AI Suggested Replies
            </div>
            {selected && suggestions.length === 0 && <p className="text-muted">No suggestions yet.</p>}
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                className="candidate-card suggestion-clickable"
                style={{ padding: '0.85rem', marginBottom: '0.6rem', width: '100%', textAlign: 'left' }}
                onClick={() => send(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {showPicker && (
        <div className="modal-overlay" onClick={() => setShowPicker(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="card-heading">Start a new conversation</h3>
            <input
              className="input-field"
              placeholder="Search candidates…"
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
              style={{ marginBottom: '0.75rem' }}
              autoFocus
            />
            <div className="picker-list">
              {pickerCandidates.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="picker-item"
                  onClick={() => startConversation(c.id)}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{c.name}</div>
                    <div className="text-muted" style={{ fontSize: '0.82rem' }}>{c.phone || 'No phone'} · {stageLabel(c.stage)}</div>
                  </div>
                </button>
              ))}
              {pickerCandidates.length === 0 && <p className="text-muted">No candidates found.</p>}
            </div>
            <div className="modal-actions">
              <button type="button" className="button-pill button-secondary" onClick={() => setShowPicker(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
