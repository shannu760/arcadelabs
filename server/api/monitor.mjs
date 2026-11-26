/* Error reporting.

   Two sinks, neither of them required:
     * one structured JSON line per failure, which every host already collects;
     * Sentry, when SENTRY_DSN is set. The DSN is public-ish but stays server
       side, so the browser never talks to Sentry directly and no source maps or
       tokens are shipped.

   Reporting must never change the response a caller gets: every network call
   here is time-boxed and its failure swallowed.
*/

const DSN = String(process.env.SENTRY_DSN || '').trim();

function sentryEndpoint() {
  if (!DSN) return null;
  try {
    const url = new URL(DSN);
    const key = url.username;
    const project = url.pathname.replace(/^\/+/, '');
    if (!key || !project) return null;
    return {
      url: `${url.protocol}//${url.host}/api/${project}/store/`,
      key,
      env: url.searchParams.get('environment') || process.env.NODE_ENV || 'production',
    };
  } catch {
    return null;
  }
}

const endpoint = sentryEndpoint();

function stackFrames(stack) {
  if (typeof stack !== 'string') return [];
  return stack
    .split('\n')
    .slice(1, 40)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({ filename: line }));
}

/**
 * Records one failure. `context` is plain JSON: never put tokens, passwords or
 * connection strings in it.
 */
export function reportError(error, context = {}) {
  const message = String(error?.message || error || 'Unknown error').slice(0, 500);
  const stack = typeof error?.stack === 'string' ? error.stack.slice(0, 8000) : null;

  try {
    console.error(
      JSON.stringify({
        level: 'error',
        ts: new Date().toISOString(),
        source: context.source || 'server',
        message,
        stack,
        ...context,
      })
    );
  } catch {
    /* logging must not throw */
  }

  if (!endpoint) return;

  const event = {
    event_id: globalThis.crypto?.randomUUID?.().replace(/-/g, '') || undefined,
    timestamp: new Date().toISOString(),
    platform: 'node',
    level: 'error',
    environment: endpoint.env,
    logger: 'student-icon',
    transaction: context.route || context.path,
    message,
    exception: {
      values: [{ type: error?.name || 'Error', value: message, stacktrace: { frames: stackFrames(stack) } }],
    },
    tags: { source: context.source || 'server' },
    extra: Object.fromEntries(
      Object.entries(context).filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
    ),
  };

  fetch(endpoint.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-sentry-auth': `Sentry sentry_version=7, sentry_key=${endpoint.key}, sentry_client=student-icon/1.0`,
    },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(3000),
  }).catch(() => null);
}

/** Installs process-level handlers once, so an unhandled rejection is visible. */
export function watchProcess() {
  if (globalThis.__siMonitoring) return;
  globalThis.__siMonitoring = true;

  process.on('unhandledRejection', (reason) => {
    reportError(reason instanceof Error ? reason : new Error(String(reason)), {
      source: 'unhandledRejection',
    });
  });

  process.on('uncaughtException', (error) => {
    reportError(error, { source: 'uncaughtException' });
  });
}
