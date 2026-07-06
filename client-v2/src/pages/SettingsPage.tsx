import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { User } from '../types';

export default function SettingsPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [settings, setSettings] = useState<Record<string, Record<string, unknown>>>({});
  const [tab, setTab] = useState('team');
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '' });

  const load = () => {
    api.getUsers().then(setUsers);
    api.getSettings().then((s) => setSettings(s as Record<string, Record<string, unknown>>));
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
                    <div key={u.id} className="setting-item">
                      <span>{u.name} ({u.role})</span>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{u.email}</span>
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
                <button
                  type="button"
                  className="button-pill button-secondary"
                  style={{ marginTop: '1rem', width: '100%' }}
                  onClick={async () => {
                    await api.updateSetting('whatsapp', {
                      connected: true,
                      phone: '+91 98765 43210',
                      businessName: 'AIOS Recruitment',
                    });
                    load();
                  }}
                >
                  Reconnect Account
                </button>
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
