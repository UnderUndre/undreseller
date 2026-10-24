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
import { useTranslations } from 'next-intl';

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
  // T040 (FR-411): admin chrome i18n; profile/portfolio content stays authored.
  const t = useTranslations('admin.team');
  const tCommon = useTranslations('admin.common');
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
      if (profilesRes.status === 401) throw new Error(tCommon('errorGeneric'));
      if (!profilesRes.ok) {
        const data = await profilesRes.json().catch(() => ({}));
        throw new Error(data.error || tCommon('errorGeneric'));
      }
      const profilesData = await profilesRes.json();
      setProfiles(profilesData.profiles || []);
      if (hoursRes.ok) {
        const hoursData = await hoursRes.json();
        setHours(hoursData.hours || []);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : tCommon('errorGeneric'));
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
      setNotice(err instanceof Error ? err.message : tCommon('errorGeneric'));
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
      setNotice(err instanceof Error ? err.message : tCommon('errorGeneric'));
    }
  }

  async function addPortfolio(p: Profile) {
    const form = portfolioForm[p.id];
    if (!form?.title || !form?.mediaUrl) {
      setNotice(t('portfolioNeedsTitle'));
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
      setNotice(err instanceof Error ? err.message : tCommon('errorGeneric'));
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
      setNotice(err instanceof Error ? err.message : tCommon('errorGeneric'));
    }
  }

  function onPhotoUploaded(image: UploadedImage) {
    setEdit((prev) => ({ ...prev, photoUrl: image.publicUrl }));
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 text-base-content pb-24">
      <div className="border-b border-base-300 pb-4 mb-4">
        <h1 className="text-xl font-extrabold tracking-tight">{t('title')}</h1>
        <p className="text-xs text-base-content/60 pt-1">{t('subtitle')}</p>
      </div>

      {errorMsg && (
        <div className="p-4 bg-error-surface/40 border border-error/60 rounded-xl text-xs text-error mb-4">
          {errorMsg}
          {errorMsg.includes('sign in') && (
            <a href="/admin/login" className="underline text-purple-400">
              {' '}
              {tCommon('goToLogin')}
            </a>
          )}
        </div>
      )}
      {notice && (
        <div className="p-3 bg-base-200 border border-base-300 rounded-xl text-xs text-base-content/80 mb-4">{notice}</div>
      )}

      {loading ? (
        <p className="text-sm text-base-content/60">{tCommon('loading')}</p>
      ) : (
        <div className="space-y-4">
          {profiles.map((p) => (
            <section key={p.id} className="bg-base-200 border border-base-300 rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {p.staffMember.displayName}{' '}
                    <span className="text-xs text-base-content/50">({p.staffMember.role})</span>
                  </p>
                  <p className="text-xs text-base-content/60 truncate">
                    /{p.slug} {p.headline ? `· ${p.headline}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => void togglePublish(p)}
                  aria-pressed={p.isPublished}
                  className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                    p.isPublished
                      ? 'bg-purple-600 border-purple-400 text-white'
                      : 'bg-base-300 border-base-300 text-base-content/60'
                  }`}
                >
                  {p.isPublished ? t('published') : t('unpublished')}
                </button>
              </div>

              {editingId === p.id ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-base-content/60 mb-1">{t('headline')}</label>
                    <input
                      value={edit.headline}
                      onChange={(e) => setEdit({ ...edit, headline: e.target.value })}
                      maxLength={200}
                      className="w-full bg-base-300 border border-base-300 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-base-content/60 mb-1">{t('biography')}</label>
                    <textarea
                      value={edit.biography}
                      onChange={(e) => setEdit({ ...edit, biography: e.target.value })}
                      maxLength={2000}
                      rows={3}
                      className="w-full bg-base-300 border border-base-300 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <ImageUploader folder="profiles" label={t('profilePhoto')} onUploaded={onPhotoUploaded} />
                  {edit.photoUrl && <p className="text-xs text-base-content/50 truncate">{t('photo', { url: edit.photoUrl })}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={() => void saveProfile(p)}
                      className="text-xs bg-purple-600 hover:bg-purple-500 px-3 py-1.5 rounded-lg font-medium"
                    >
                      {tCommon('save')}
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-xs bg-base-300 hover:bg-base-300 px-3 py-1.5 rounded-lg"
                    >
                      {tCommon('cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => startEdit(p)}
                  className="text-xs bg-base-300 hover:bg-base-300 px-3 py-1.5 rounded-lg"
                >
                  {t('editProfile')}
                </button>
              )}

              <div className="border-t border-base-300 pt-3 space-y-2">
                <p className="text-xs font-semibold text-base-content/80">{t('portfolio')}</p>
                {p.portfolioItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-2">
                    {item.mediaUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.mediaUrl}
                        alt={item.title}
                        className="w-10 h-10 rounded object-cover border border-base-300"
                      />
                    )}
                    <span className="flex-1 text-xs text-base-content/80 truncate">{item.title}</span>
                    <button
                      onClick={() => void togglePortfolioPublish(p, item)}
                      aria-pressed={item.isPublished}
                      className={`text-[11px] px-2 py-1 rounded border ${
                        item.isPublished
                          ? 'bg-purple-600 border-purple-400 text-white'
                          : 'bg-base-300 border-base-300 text-base-content/60'
                      }`}
                    >
                      {item.isPublished ? t('live') : t('draft')}
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
                    placeholder={t('portfolioTitlePlaceholder')}
                    className="w-full bg-base-300 border border-base-300 rounded-lg px-3 py-2 text-sm"
                  />
                  <ImageUploader
                    folder="portfolio"
                    label={t('portfolioPhoto')}
                    onUploaded={(image) =>
                      setPortfolioForm({
                        ...portfolioForm,
                        [p.id]: { ...(portfolioForm[p.id] || { title: '' }), mediaUrl: image.publicUrl },
                      })
                    }
                  />
                  <button
                    onClick={() => void addPortfolio(p)}
                    className="text-xs bg-base-300 hover:bg-base-300 px-3 py-1.5 rounded-lg"
                  >
                    {t('addPortfolio')}
                  </button>
                </div>
              </div>
            </section>
          ))}

          {profiles.length === 0 && <p className="text-sm text-base-content/60">{t('noProfiles')}</p>}

          <section className="bg-base-200 border border-base-300 rounded-xl p-4">
            <p className="text-xs font-semibold text-base-content/80 mb-2">{t('workingHours')}</p>
            {hours.length === 0 ? (
              <p className="text-xs text-base-content/50">{t('noHours')}</p>
            ) : (
              <ul className="space-y-1">
                {hours.map((h) => (
                  <li key={h.id} className="text-xs text-base-content/60">
                    <span className="text-base-content/80">{WEEKDAYS[(h.weekday - 1) % 7]}</span>{' '}
                    {fmtMin(h.startMin)}–{fmtMin(h.endMin)}
                    {h.itemId ? '' : t('global')}
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
