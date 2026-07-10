import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { User } from '../types';

export default function SettingsPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [settings, setSettings] = useState<Record<string, Record<string, unknown>>>({});
  const [tab, setTab] = useState('team');
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '' });
  const [waForm, setWaForm] = useState({ phone: '', businessName: '' });

  const load = () => {
    api.getUsers().then(setUsers);
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
                <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {whatsapp.connected
                    ? `Connected: ${whatsapp.phone as string} (${whatsapp.businessName as string})`
                    : 'Not connected'}
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
