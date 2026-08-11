export class ApiError extends Error {
  constructor(status, code, message, retryAfter) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

/**
 * Turns an API error code into something the person can act on. The server
 * message is accurate but written for a program; these add the next step.
 */
const ADVICE = {
  unauthenticated: 'No token was sent. Run: sona auth login',
  invalid_token: 'This token is not valid any more. Create a new one under API in your dashboard, then run: sona auth login',
  plan_required: 'Your plan does not include API access.',
  plan_expired: 'Your plan has expired.',
  insufficient_scope: 'This token cannot do that. Create a token with write access if you need to publish.',
  quota_exceeded: 'You have used your allowance for this month.',
};

export async function request(ctx, method, path, { query, body } = {}) {
  const url = new URL(ctx.url.replace(/\/+$/, '') + path);

  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, value);
  }

  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${ctx.token}`,
        Accept: 'application/json',
        'User-Agent': 'sonato-cli',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (cause) {
    throw new ApiError(0, 'network', `Could not reach ${url.origin}. ${cause.message}`);
  }

  const text = await response.text();
  let payload = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      // An HTML body here usually means something in front of the API
      // answered instead of the API itself.
      throw new ApiError(
        response.status,
        'bad_response',
        `Expected JSON from ${url.pathname} but got ${response.headers.get('content-type') || 'no content type'}.`
      );
    }
  }

  if (!response.ok) {
    const code = payload?.error?.code || 'error';
    const detail = payload?.error?.message || `HTTP ${response.status}`;
    const advice = ADVICE[code];

    throw new ApiError(
      response.status,
      code,
      advice ? `${detail}\n${advice}` : detail,
      Number(response.headers.get('retry-after')) || undefined
    );
  }

  return {
    data: payload?.data,
    meta: payload?.meta,
    rateLimit: {
      limit: response.headers.get('x-ratelimit-limit'),
      remaining: response.headers.get('x-ratelimit-remaining'),
    },
  };
}
