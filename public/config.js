// Backend URL injected at build time. Override in Vercel env vars.
window.UNO_CONFIG = {
  // Default: same origin (works when frontend and backend are hosted together)
  // Override with BACKEND_URL env var in Vercel to point at a separate host.
  backendUrl: (function() {
    if (typeof window === 'undefined') return '';
    // 1) Inline override (set in index.html before this script)
    if (window.__UNO_BACKEND_URL__) return window.__UNO_BACKEND_URL__;
    // 2) Same origin (works for single-host deploys on Render/Railway/Fly)
    return window.location.origin;
  })()
};
