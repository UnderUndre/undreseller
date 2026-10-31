'use client';

/**
 * T025 (FR-601/604, US1/US3): Integrations section of /admin/settings.
 * Google Calendar per-resource status (CONNECTED/NEEDS_REAUTH/DISABLED),
 * connect (OWNER), disconnect (OWNER, full wipe), NEEDS_REAUTH banner.
 * Webhooks subsection renders behind NEXT_PUBLIC_FEATURE_WEBHOOKS
 * (default off — API lands post-Demand Gate, Phase 6 of 006).
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

interface GcalCredential {
  id: string;
  resourceId: string | null;
  status: string;
  lastSyncAt: string | null;
  lastError: string | null;
}

interface WebhookEndpointView {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  failureCount: number;
  secretPrefix: string;
  lastDeliveryStatus: string | null;
}

export default function IntegrationsPanel({ isOwner }: { isOwner: boolean }) {
  const t = useTranslations('admin.integrations');
  const [credentials, setCredentials] = useState<GcalCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const webhooksEnabled = process.env.NEXT_PUBLIC_FEATURE_WEBHOOKS === 'on';
  const [webhooks, setWebhooks] = useState<WebhookEndpointView[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/integrations/gcal');
      if (res.ok) {
        const data = await res.json();
        setCredentials(data.credentials ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadWebhooks = useCallback(async () => {
    if (!webhooksEnabled) return;
    const res = await fetch('/api/admin/webhooks');
    if (res.ok) {
      const data = await res.json();
      setWebhooks(data.endpoints ?? []);
    }
  }, [webhooksEnabled]);

  useEffect(() => {
    void loadWebhooks();
  }, [loadWebhooks]);

  const connect = (resourceId: string | null) => {
    const qs = resourceId ? `?resourceId=${encodeURIComponent(resourceId)}` : '';
    window.location.href = `/api/admin/integrations/gcal/connect${qs}`;
  };

  const disconnect = async (credential: GcalCredential) => {
    if (!window.confirm(t('disconnectConfirm'))) return;
    const qs = credential.resourceId ? `?resourceId=${encodeURIComponent(credential.resourceId)}` : '';
    const res = await fetch(`/api/admin/integrations/gcal${qs}`, { method: 'DELETE' });
    if (res.ok) {
      setNotice(t('disconnected'));
      await load();
    } else {
      setErrorMsg(t('disconnectFailed'));
    }
  };

  const reactivate = async (id: string) => {
    const res = await fetch(`/api/admin/webhooks/${id}`, { method: 'PATCH' });
    if (res.ok) await loadWebhooks();
  };

  const testPing = async (id: string) => {
    const res = await fetch(`/api/admin/webhooks/${id}/test`, { method: 'POST' });
    if (res.ok) setNotice(t('testPingSent'));
  };

  const needsReauth = credentials.some((c) => c.status === 'NEEDS_REAUTH');

  return (
    <section className="bg-base-200 border border-base-300 rounded-xl p-4 space-y-3 mb-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold">{t('title')}</h2>
      </div>

      {needsReauth && (
        <div role="alert" className="alert alert-warning text-sm">
          {t('needsReauthBanner')}
        </div>
      )}
      {notice && <div className="text-sm text-success">{notice}</div>}
      {errorMsg && <div className="text-sm text-error">{errorMsg}</div>}

      {loading ? (
        <div className="text-sm opacity-70">{tCommonLoader()}</div>
      ) : credentials.length === 0 ? (
        <div className="text-sm opacity-70">{t('notConnected')}</div>
      ) : (
        <div className="space-y-2">
          {credentials.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-2 border border-base-300 rounded-lg px-3 py-2 text-sm"
            >
              <div>
                <span className="font-mono">{c.resourceId ?? 'default_master'}</span>
                <span
                  className={`badge badge-sm ml-2 ${
                    c.status === 'CONNECTED'
                      ? 'badge-success'
                      : c.status === 'NEEDS_REAUTH'
                        ? 'badge-warning'
                        : 'badge-ghost'
                  }`}
                >
                  {c.status}
                </span>
                {c.lastSyncAt && (
                  <span className="opacity-60 ml-2 text-xs">{t('lastSync')}: {new Date(c.lastSyncAt).toLocaleString()}</span>
                )}
                {c.lastError && <div className="text-xs text-error">{c.lastError}</div>}
              </div>
              {isOwner && (
                <div className="flex gap-2">
                  {c.status === 'NEEDS_REAUTH' && (
                    <button className="btn btn-xs btn-warning" onClick={() => connect(c.resourceId)}>
                      {t('reconnect')}
                    </button>
                  )}
                  <button className="btn btn-xs btn-ghost" onClick={() => void disconnect(c)}>
                    {t('disconnect')}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {isOwner && (
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-xs btn-primary" onClick={() => connect(null)}>
            {t('connectInstanceWide')}
          </button>
        </div>
      )}

      {webhooksEnabled && (
        <div className="pt-2 border-t border-base-300">
          <h3 className="text-sm font-semibold mb-2">{t('webhooksTitle')}</h3>
          {webhooks.length === 0 ? (
            <div className="text-sm opacity-70">{t('noWebhooks')}</div>
          ) : (
            <div className="space-y-2">
              {webhooks.map((w) => (
                <div key={w.id} className="flex items-center justify-between gap-2 text-sm border border-base-300 rounded-lg px-3 py-2">
                  <div className="font-mono text-xs truncate">
                    {w.secretPrefix} · {w.url}
                    <span className={`badge badge-sm ml-2 ${w.active ? 'badge-success' : 'badge-error'}`}>
                      {w.active ? 'active' : 'disabled'}
                    </span>
                    {w.failureCount > 0 && <span className="ml-2 opacity-70">fails: {w.failureCount}</span>}
                  </div>
                  <div className="flex gap-2">
                    {!w.active && (
                      <button className="btn btn-xs btn-warning" onClick={() => void reactivate(w.id)}>
                        {t('reactivate')}
                      </button>
                    )}
                    <button className="btn btn-xs btn-ghost" onClick={() => void testPing(w.id)}>
                      {t('testPing')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function tCommonLoader(): string {
  return '…';
}
