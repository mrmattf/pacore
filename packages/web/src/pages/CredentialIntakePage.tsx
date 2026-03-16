import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { ChevronDown, ChevronRight, Loader2, Check, AlertCircle } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '';
const CF_TURNSTILE_SITE_KEY = import.meta.env.VITE_CF_TURNSTILE_SITE_KEY || '';

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement | string, opts: object) => string;
      reset: (widgetId: string) => void;
      getResponse: (widgetId: string) => string;
    };
  }
}

function Accordion({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        {title}
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {open && (
        <div className="px-4 py-3 text-sm text-gray-600 space-y-2 border-t border-gray-100">
          {children}
        </div>
      )}
    </div>
  );
}

export function CredentialIntakePage() {
  const { token } = useParams<{ token: string }>();

  // Page state
  const [pageState, setPageState] = useState<'loading' | 'ready' | 'success' | 'expired' | 'error'>('loading');
  const [pageData, setPageData] = useState<{ orgName: string; operatorName: string; operatorEmail: string } | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  // Form state
  const [shopifyDomain, setShopifyDomain] = useState('');
  const [shopifyApiKey, setShopifyApiKey] = useState('');
  const [shopifyApiSecretKey, setShopifyApiSecretKey] = useState('');
  const [gorgiasDomain, setGorgiasDomain] = useState('');
  const [gorgiasEmail, setGorgiasEmail] = useState('');
  const [gorgiasApiKey, setGorgiasApiKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<Record<string, { domain: string }> | null>(null);

  // Turnstile
  const turnstileRef = useRef<HTMLDivElement>(null);
  const turnstileWidgetId = useRef<string | null>(null);
  const [turnstileReady, setTurnstileReady] = useState(!CF_TURNSTILE_SITE_KEY);

  // Persist partial form state to localStorage (no secrets)
  const storageKey = token ? `clarissi-intake-${token}` : null;

  useEffect(() => {
    if (!storageKey) return;
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const p = JSON.parse(saved);
        if (p.shopifyDomain) setShopifyDomain(p.shopifyDomain);
        if (p.gorgiasDomain) setGorgiasDomain(p.gorgiasDomain);
        if (p.gorgiasEmail) setGorgiasEmail(p.gorgiasEmail);
        // API keys are never persisted — user must re-enter them
      } catch {}
    }
  }, [storageKey]);

  function savePartial() {
    if (!storageKey) return;
    // Save only non-credential fields — API keys and secrets are never persisted to localStorage
    localStorage.setItem(storageKey, JSON.stringify({
      shopifyDomain,
      gorgiasDomain, gorgiasEmail,
    }));
  }

  useEffect(() => {
    if (!token) return;

    fetch(`${API_BASE}/v1/onboard/${token}`)
      .then(async r => {
        if (r.status === 410 || !r.ok) {
          const data = await r.json().catch(() => ({}));
          setPageError(data.error || 'This link is no longer valid.');
          setPageState('expired');
        } else {
          const data = await r.json();
          setPageData(data);
          setPageState('ready');
        }
      })
      .catch(() => {
        setPageError('Unable to load this page. Please check your connection.');
        setPageState('error');
      });
  }, [token]);

  // Load Cloudflare Turnstile script
  useEffect(() => {
    if (!CF_TURNSTILE_SITE_KEY || pageState !== 'ready') return;

    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => {
      if (turnstileRef.current && window.turnstile) {
        turnstileWidgetId.current = window.turnstile.render(turnstileRef.current, {
          sitekey: CF_TURNSTILE_SITE_KEY,
          callback: () => setTurnstileReady(true),
          'expired-callback': () => setTurnstileReady(false),
          'error-callback': () => setTurnstileReady(false),
        });
      }
    };
    document.head.appendChild(script);
  }, [pageState]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    savePartial();
    setSubmitting(true);
    setSubmitError(null);

    const cfTurnstileToken = (CF_TURNSTILE_SITE_KEY && turnstileWidgetId.current)
      ? window.turnstile?.getResponse(turnstileWidgetId.current) || ''
      : 'dev-bypass';

    try {
      const res = await fetch(`${API_BASE}/v1/onboard/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopify: {
            domain: shopifyDomain.trim(),
            apiKey: shopifyApiKey.trim(),
            apiSecretKey: shopifyApiSecretKey.trim(),
          },
          gorgias: {
            domain: gorgiasDomain.trim(),
            email: gorgiasEmail.trim(),
            apiKey: gorgiasApiKey.trim(),
          },
          cfTurnstileToken,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error || 'Something went wrong. Please try again.');
        if (CF_TURNSTILE_SITE_KEY && turnstileWidgetId.current) {
          window.turnstile?.reset(turnstileWidgetId.current);
          setTurnstileReady(false);
        }
        return;
      }

      // Clear localStorage on success
      if (storageKey) localStorage.removeItem(storageKey);
      setSuccessData(data.received);
      setPageState('success');
    } catch {
      setSubmitError('Network error. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // ---- Render states ----

  if (pageState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 size={20} className="animate-spin text-gray-400" />
      </div>
    );
  }

  if (pageState === 'expired' || pageState === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-lg border border-gray-200 p-8 text-center shadow-sm">
          <div className="text-4xl mb-4">🔒</div>
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Link expired or already used</h1>
          <p className="text-sm text-gray-500">{pageError}</p>
          {pageData?.operatorEmail && (
            <p className="text-sm text-gray-500 mt-3">
              Contact <a href={`mailto:${pageData.operatorEmail}`} className="text-blue-600 hover:underline">{pageData.operatorEmail}</a> for a new link.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (pageState === 'success' && successData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-lg border border-gray-200 p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <Check size={20} className="text-green-600" />
            </div>
            <h1 className="text-lg font-semibold text-gray-900">Credentials received</h1>
          </div>

          <p className="text-sm text-gray-600 mb-4">We received your credentials for:</p>

          <div className="space-y-2 mb-6">
            {successData.shopify && (
              <div className="flex items-center gap-2 text-sm">
                <Check size={14} className="text-green-500 shrink-0" />
                <span className="text-gray-700">Shopify store <code className="bg-gray-100 rounded px-1.5 py-0.5 text-xs">{successData.shopify.domain}</code></span>
              </div>
            )}
            {successData.gorgias && (
              <div className="flex items-center gap-2 text-sm">
                <Check size={14} className="text-green-500 shrink-0" />
                <span className="text-gray-700">Gorgias account <code className="bg-gray-100 rounded px-1.5 py-0.5 text-xs">{successData.gorgias.domain}</code></span>
              </div>
            )}
          </div>

          <p className="text-sm text-gray-500">
            {pageData?.operatorName || 'Your operator'} will be in touch shortly.
          </p>
        </div>
      </div>
    );
  }

  // ---- Main form ----

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Minimal header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <span className="text-lg font-bold text-gray-900">Clarissi</span>
      </div>

      <div className="max-w-xl mx-auto px-4 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            Connect {pageData?.orgName || 'your account'} to Clarissi
          </h1>
          <p className="text-gray-500 mt-2 text-sm">
            Pull your API credentials from the steps below — this is a one-time setup. Once submitted, your operator manages everything from here on.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Shopify section */}
          <section className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
            <h2 className="font-semibold text-gray-900">Shopify</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Store domain</label>
              <input
                type="text"
                value={shopifyDomain}
                onChange={(e) => { setShopifyDomain(e.target.value); savePartial(); }}
                placeholder="yourstore.myshopify.com"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">API key</label>
              <input
                type="text"
                value={shopifyApiKey}
                onChange={(e) => { setShopifyApiKey(e.target.value); savePartial(); }}
                placeholder="Labeled 'API key' on the credentials tab"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">API secret key</label>
              <input
                type="password"
                value={shopifyApiSecretKey}
                onChange={(e) => setShopifyApiSecretKey(e.target.value)}
                placeholder="Click 'Reveal' then copy before switching tabs"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
                required
              />
              <p className="text-xs text-gray-400 mt-1">Not saved in your browser — copy it fresh from Shopify each session.</p>
            </div>

            <Accordion title="Where do I find these? (step-by-step)">
              <ol className="list-decimal list-inside space-y-2 text-gray-600">
                <li>Log in to your Shopify Admin (<code className="text-xs bg-gray-100 rounded px-1">yourstore.myshopify.com/admin</code>)</li>
                <li>Click <strong>Apps</strong> in the left sidebar → <strong>Develop apps</strong> (top right)</li>
                <li>If prompted, click <strong>Allow custom app development</strong> to confirm</li>
                <li>Click <strong>Create an app</strong> → name it <em>Clarissi Automation</em> → <strong>Create app</strong></li>
                <li>Click <strong>Configure Admin API scopes</strong></li>
                <li>Search for and enable: <strong>read_orders</strong>, <strong>read_inventory</strong>, <strong>read_products</strong>, <strong>read_customers</strong></li>
                <li>Click <strong>Save</strong> → then <strong>Install app</strong> → confirm</li>
                <li>Go to the <strong>API credentials</strong> tab. Copy <em>API key</em> and click <strong>Reveal</strong> to copy <em>API secret key</em> — copy the secret before switching tabs or it will hide again.</li>
              </ol>
            </Accordion>
          </section>

          {/* Gorgias section */}
          <section className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
            <h2 className="font-semibold text-gray-900">Gorgias</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subdomain</label>
              <input
                type="text"
                value={gorgiasDomain}
                onChange={(e) => { setGorgiasDomain(e.target.value); savePartial(); }}
                placeholder="yourstore (the part before .gorgias.com)"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={gorgiasEmail}
                onChange={(e) => { setGorgiasEmail(e.target.value); savePartial(); }}
                placeholder="your Gorgias login email"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">API key</label>
              <input
                type="password"
                value={gorgiasApiKey}
                onChange={(e) => { setGorgiasApiKey(e.target.value); savePartial(); }}
                placeholder="Generated from Settings → REST API"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
                required
              />
            </div>

            <Accordion title="Where do I find these? (step-by-step)">
              <ol className="list-decimal list-inside space-y-2 text-gray-600">
                <li>Log in to your Gorgias account</li>
                <li>Go to <strong>Settings</strong> → <strong>REST API</strong></li>
                <li>Under <strong>API Keys</strong>, click <strong>Generate API Key</strong></li>
                <li>Your subdomain is the part before <code className="text-xs bg-gray-100 rounded px-1">.gorgias.com</code> in your browser URL</li>
                <li>Copy the subdomain, your login email, and the generated API key</li>
              </ol>
            </Accordion>
          </section>

          {/* Turnstile */}
          {CF_TURNSTILE_SITE_KEY && (
            <div ref={turnstileRef} className="flex justify-center" />
          )}

          {submitError && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <AlertCircle size={14} className="shrink-0" />
              {submitError}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || (CF_TURNSTILE_SITE_KEY ? !turnstileReady : false)}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {submitting && <Loader2 size={16} className="animate-spin" />}
            {submitting ? 'Submitting…' : 'Submit credentials'}
          </button>

          <p className="text-xs text-center text-gray-400">
            Credentials are encrypted with AES-256-GCM and stored per account. You can revoke access at any time by deleting the custom app in Shopify or rotating your Gorgias API key.
          </p>
        </form>
      </div>
    </div>
  );
}
