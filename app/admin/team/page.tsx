'use client';

/**
 * Admin Team (T063, US9, FR-440, FR-441)
 * Professional profiles list + edit, portfolio (add via ImageUploader,
 * publish toggle), working hours summary. Server enforces ownership;
 * PERFORMER sees only their own profile (server-side rule, mirrored in UI).
 */

import React, { useCallback, useEffect, useState } from 'react';
import ImageUploader, { UploadedImage } from '@/components/admin/ImageUploader';
import AdminNav from '@/components/admin/AdminNav';

interface PortfolioItem {
  id: string;
  title: string;
  description: string | null;
  mediaUrl: string;
  isPublished: boolean;
  sortOrder: number;
}

interface StaffMemberInfo {
  id: string;
  displayName: string;
  role: string;
  active: boolean;
}

interface Profile {
  id: string;
  slug: string;
  headline: string | null;
  biography: string | null;
  photoUrl: string | null;
  isPublished: boolean;
  staffMember: StaffMemberInfo;
  portfolioItems: PortfolioItem[];
}

interface HourEntry {
  id: string;
  itemId: string | null;
  resourceId: string;
  weekday: number;
  startMin: number;
  endMin: number;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function fmtMin(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export default function AdminTeamPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [hours, setHours] = useState<HourEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ displayName: '', headline: '', biography: '', photoUrl: '' });
  const [portfolioForm, setPortfolioForm] = useState<Record<string, { title: string; mediaUrl: string }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [profilesRes, hoursRes] = await Promise.all([
        fetch('/api/admin/profiles'),
        fetch('/api/admin/hours'),
      ]);
      if (profilesRes.status === 401) throw new Error('Please sign in with staff credentials');
      if (!profilesRes.ok) {
        const data = await profilesRes.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load profiles');
      }
      const profilesData = await profilesRes.json();
      setProfiles(profilesData.profiles || []);
      if (hoursRes.ok) {
        const hoursData = await hoursRes.json();
        setHours(hoursData.hours || []);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error loading team');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function startEdit(p: Profile) {
    setEditingId(p.id);
    setEdit({
      displayName: p.staffMember.displayName,
      headline: p.headline || '',
      biography: p.biography || '',
      photoUrl: p.photoUrl || '',
    });
  }

  async function saveProfile(p: Profile) {
    try {
      // displayName lives on StaffMember; PATCH accepts profile fields only
      const res = await fetch(`/api/admin/profiles/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headline: edit.headline || null,
          biography: edit.biography || null,
          photoUrl: edit.photoUrl || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Save failed (${res.status})`);
      }
      setEditingId(null);
      await load();
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'Save failed');
    }
  }

  async function togglePublish(p: Profile) {
    try {
      const res = await fetch(`/api/admin/profiles/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublished: !p.isPublished }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Publish toggle failed (${res.status})`);
      }
      await load();
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'Publish toggle failed');
    }
  }

  async function addPortfolio(p: Profile) {
    const form = portfolioForm[p.id];
    if (!form?.title || !form?.mediaUrl) {
      setNotice('Portfolio item needs a title and an uploaded photo');
      return;
    }
    try {
      const res = await fetch(`/api/admin/profiles/${p.id}/portfolio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: form.title, mediaUrl: form.mediaUrl, isPublished: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Add failed (${res.status})`);
      }
      setPortfolioForm({ ...portfolioForm, [p.id]: { title: '', mediaUrl: '' } });
      await load();
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'Add failed');
    }
  }

  async function togglePortfolioPublish(p: Profile, item: PortfolioItem) {
    try {
      const res = await fetch(`/api/admin/profiles/${p.id}/portfolio/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublished: !item.isPublished }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Toggle failed (${res.status})`);
      }
      await load();
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'Toggle failed');
    }
  }

  function onPhotoUploaded(image: UploadedImage) {
    setEdit((prev) => ({ ...prev, photoUrl: image.publicUrl }));
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 text-white pb-24">
      <div className="border-b border-gray-800 pb-4 mb-4">
        <h1 className="text-xl font-extrabold tracking-tight">Team</h1>
        <p className="text-xs text-gray-400 pt-1">Professional profiles, portfolio and working hours (FR-440)</p>
      </div>

      {errorMsg && (
        <div className="p-4 bg-error-surface/40 border border-error/60 rounded-xl text-xs text-error mb-4">
          {errorMsg}
          {errorMsg.includes('sign in') && (
            <a href="/admin/login" className="underline text-purple-400">
              {' '}
              Go to login
            </a>
          )}
        </div>
      )}
      {notice && (
        <div className="p-3 bg-gray-900 border border-gray-700 rounded-xl text-xs text-gray-300 mb-4">{notice}</div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <div className="space-y-4">
          {profiles.map((p) => (
            <section key={p.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {p.staffMember.displayName}{' '}
                    <span className="text-xs text-gray-500">({p.staffMember.role})</span>
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    /{p.slug} {p.headline ? `· ${p.headline}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => void togglePublish(p)}
                  aria-pressed={p.isPublished}
                  className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                    p.isPublished
                      ? 'bg-purple-600 border-purple-400 text-white'
                      : 'bg-gray-800 border-gray-700 text-gray-400'
                  }`}
                >
                  {p.isPublished ? 'Published' : 'Unpublished'}
                </button>
              </div>

              {editingId === p.id ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Headline</label>
                    <input
                      value={edit.headline}
                      onChange={(e) => setEdit({ ...edit, headline: e.target.value })}
                      maxLength={200}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Biography</label>
                    <textarea
                      value={edit.biography}
                      onChange={(e) => setEdit({ ...edit, biography: e.target.value })}
                      maxLength={2000}
                      rows={3}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <ImageUploader folder="profiles" label="Profile photo" onUploaded={onPhotoUploaded} />
                  {edit.photoUrl && <p className="text-xs text-gray-500 truncate">Photo: {edit.photoUrl}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={() => void saveProfile(p)}
                      className="text-xs bg-purple-600 hover:bg-purple-500 px-3 py-1.5 rounded-lg font-medium"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-xs bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => startEdit(p)}
                  className="text-xs bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg"
                >
                  Edit profile
                </button>
              )}

              <div className="border-t border-gray-800 pt-3 space-y-2">
                <p className="text-xs font-semibold text-gray-300">Portfolio</p>
                {p.portfolioItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-2">
                    {item.mediaUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.mediaUrl}
                        alt={item.title}
                        className="w-10 h-10 rounded object-cover border border-gray-700"
                      />
                    )}
                    <span className="flex-1 text-xs text-gray-300 truncate">{item.title}</span>
                    <button
                      onClick={() => void togglePortfolioPublish(p, item)}
                      aria-pressed={item.isPublished}
                      className={`text-[11px] px-2 py-1 rounded border ${
                        item.isPublished
                          ? 'bg-purple-600 border-purple-400 text-white'
                          : 'bg-gray-800 border-gray-700 text-gray-400'
                      }`}
                    >
                      {item.isPublished ? 'Live' : 'Draft'}
                    </button>
                  </div>
                ))}
                <div className="space-y-2 pt-1">
                  <input
                    value={portfolioForm[p.id]?.title || ''}
                    onChange={(e) =>
                      setPortfolioForm({
                        ...portfolioForm,
                        [p.id]: { ...(portfolioForm[p.id] || { mediaUrl: '' }), title: e.target.value },
                      })
                    }
                    placeholder="Portfolio item title"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                  />
                  <ImageUploader
                    folder="portfolio"
                    label="Portfolio photo"
                    onUploaded={(image) =>
                      setPortfolioForm({
                        ...portfolioForm,
                        [p.id]: { ...(portfolioForm[p.id] || { title: '' }), mediaUrl: image.publicUrl },
                      })
                    }
                  />
                  <button
                    onClick={() => void addPortfolio(p)}
                    className="text-xs bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg"
                  >
                    Add portfolio item
                  </button>
                </div>
              </div>
            </section>
          ))}

          {profiles.length === 0 && <p className="text-sm text-gray-400">No professional profiles yet.</p>}

          <section className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-300 mb-2">Working hours summary</p>
            {hours.length === 0 ? (
              <p className="text-xs text-gray-500">No weekly hours configured.</p>
            ) : (
              <ul className="space-y-1">
                {hours.map((h) => (
                  <li key={h.id} className="text-xs text-gray-400">
                    <span className="text-gray-300">{WEEKDAYS[(h.weekday - 1) % 7]}</span>{' '}
                    {fmtMin(h.startMin)}–{fmtMin(h.endMin)}
                    {h.itemId ? '' : ' (global)'}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      <AdminNav />
    </div>
  );
}
