import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { MessagingIntegrationStatus, User } from '../types';

function integrationModeLabel(status: MessagingIntegrationStatus | null) {
  if (!status) return 'Checking…';
  return status.mode === 'live' ? 'Live (Meta API)' : 'Simulated (local only)';
}

export default function SettingsPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [settings, setSettings] = useState<Record<string, Record<string, unknown>>>({});
  const [integration, setIntegration] = useState<MessagingIntegrationStatus | null>(null);
  const [tab, setTab] = useState('team');
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '' });
  const [waForm, setWaForm] = useState({ phone: '', businessName: '' });

  const load = () => {
    api.getUsers().then(setUsers);
    api.getMessagingIntegrationStatus().then(setIntegration).catch(() => setIntegration(null));
    api.getSettings().then((s) => {
      const all = s as Record<string, Record<string, unknown>>;
      setSettings(all);
      const wa = all.whatsapp || {};
      setWaForm({
        phone: (wa.phone as string) || '',
        businessName: (wa.businessName as string) || '',
      });
    });
  };

  useEffect(() => {
    load();
  }, []);

  const addUser = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.createUser({ ...newUser, role: 'recruiter' });
    setNewUser({ name: '', email: '', password: '' });
    load();
  };

  const whatsapp = settings.whatsapp || {};

  return (
    <>
      <div className="topbar">
        <div className="search-bar">Settings</div>
      </div>
      <div className="page-content">
        <h1 className="section-title">Settings</h1>
        <p className="section-description">Team management, WhatsApp integration, and branding.</p>

        <div className="setting-panel">
          <div className="setting-nav">
            {['team', 'whatsapp', 'branding'].map((t) => (
              <button
                key={t}
                type="button"
                className={`nav-item${tab === t ? ' active' : ''}`}
                onClick={() => setTab(t)}
              >
                {t === 'team' ? 'Team Management' : t === 'whatsapp' ? 'WhatsApp Integration' : 'Branding'}
              </button>
            ))}
          </div>

          <div className="setting-content">
            {tab === 'team' && (
              <>
                <div className="setting-card">
                  <div className="setting-heading">Team Members</div>
                  {users.map((u) => (
                    <div key={u.id} className="setting-item" style={{ alignItems: 'center', gap: '0.75rem' }}>
                      <span>{u.name} ({u.role})</span>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{u.email}</span>
                      <input
                        className="input-field"
                        style={{ maxWidth: '16rem', fontSize: '0.85rem' }}
                        placeholder="WhatsApp signature (defaults to name)"
                        defaultValue={u.wa_signature ?? ''}
                        onBlur={async (e) => {
                          if ((e.target.value || '') === (u.wa_signature ?? '')) return;
                          await api.updateUser(u.id, { wa_signature: e.target.value });
                          load();
                        }}
                      />
                    </div>
                  ))}
                </div>
                <form className="setting-card" onSubmit={addUser}>
                  <div className="setting-heading">Add Team Member</div>
                  <input className="input-field" placeholder="Name" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} required />
                  <input className="input-field" placeholder="Email" type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} required style={{ marginTop: '0.5rem' }} />
                  <input className="input-field" placeholder="Password" type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} required style={{ marginTop: '0.5rem' }} />
                  <button type="submit" className="button-pill button-primary" style={{ marginTop: '1rem', width: '100%' }}>
                    Add member
                  </button>
                </form>
              </>
            )}

            {tab === 'whatsapp' && (
              <div className="setting-card">
                <div className="setting-heading">WhatsApp Integration</div>

                <div
                  className={`wa-integration-banner${integration?.mode === 'live' ? ' wa-integration-live' : ' wa-integration-simulated'}`}
                >
                  <div className="wa-integration-banner-head">
                    <span className="wa-integration-badge">
                      {integration?.mode === 'live' ? '● Live' : '○ Simulated'}
                    </span>
                    <strong>{integrationModeLabel(integration)}</strong>
                  </div>
                  <p className="wa-integration-detail">
                    {integration?.mode === 'live'
                      ? 'Outbound messages are delivered through the Meta WhatsApp Cloud API. Inbound replies arrive via the webhook.'
                      : 'Messages are saved in the inbox only — nothing is sent to WhatsApp until server env vars are configured (see README).'}
                  </p>
                  {integration && integration.mode === 'simulated' && integration.missing.length > 0 && (
                    <p className="wa-integration-missing">
                      Set in <code>.env</code> and restart the API: {integration.missing.join(', ')}
                    </p>
                  )}
                  {integration && (
                    <p className="wa-integration-webhook">
                      Webhook URL for Meta:{' '}
                      <code>
                        https://&lt;your-public-domain&gt;{integration.webhookPath}
                      </code>
                      {integration.configured.verifyToken
                        ? ' · Verify token is set on the server'
                        : ' · Set WHATSAPP_VERIFY_TOKEN on the server'}
                    </p>
                  )}
                </div>

                <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: '1.25rem' }}>
                  Display settings for your workspace (shown in signatures; does not connect Meta by itself):
                  {whatsapp.connected
                    ? ` ${whatsapp.phone as string} (${whatsapp.businessName as string})`
                    : ' not configured'}
                </p>
                <input
                  className="input-field"
                  placeholder="Business phone (e.g. +91 90000 00000)"
                  value={waForm.phone}
                  onChange={(e) => setWaForm({ ...waForm, phone: e.target.value })}
                  style={{ marginTop: '1rem' }}
                />
                <input
                  className="input-field"
                  placeholder="Business name"
                  value={waForm.businessName}
                  onChange={(e) => setWaForm({ ...waForm, businessName: e.target.value })}
                  style={{ marginTop: '0.5rem' }}
                />
                <button
                  type="button"
                  className="button-pill button-primary"
                  style={{ marginTop: '1rem', width: '100%' }}
                  disabled={!waForm.phone.trim() || !waForm.businessName.trim()}
                  onClick={async () => {
                    await api.updateSetting('whatsapp', {
                      connected: true,
                      phone: waForm.phone.trim(),
                      businessName: waForm.businessName.trim(),
                    });
                    load();
                  }}
                >
                  {whatsapp.connected ? 'Update Account' : 'Connect Account'}
                </button>
                {Boolean(whatsapp.connected) && (
                  <button
                    type="button"
                    className="button-pill button-secondary"
                    style={{ marginTop: '0.5rem', width: '100%' }}
                    onClick={async () => {
                      await api.updateSetting('whatsapp', { connected: false });
                      load();
                    }}
                  >
                    Disconnect
                  </button>
                )}
              </div>
            )}

            {tab === 'branding' && (
              <div className="setting-card">
                <div className="setting-heading">Branding</div>
                <input
                  className="input-field"
                  defaultValue={(settings.branding?.companyName as string) || 'AIOS Recruitment'}
                  onBlur={async (e) => {
                    await api.updateSetting('branding', {
                      ...settings.branding,
                      companyName: e.target.value,
                      primaryColor: '#6366f1',
                    });
                    load();
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
