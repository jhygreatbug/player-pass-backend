export function isOriginAllowed(origin, allowedOrigins) {
  if (typeof origin !== 'string' || origin === '') return false;
  return allowedOrigins.includes('*') || allowedOrigins.includes(origin);
}

export function applyCorsHeaders(response, request, allowedOrigins) {
  const origin = request.headers.get('Origin');
  const allowsAnyOrigin = allowedOrigins.includes('*');

  if (!allowsAnyOrigin && !isOriginAllowed(origin, allowedOrigins)) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', allowsAnyOrigin ? '*' : origin);
  headers.set('Access-Control-Expose-Headers', 'X-Cache');
  if (!allowsAnyOrigin) {
    headers.set('Vary', 'Origin');
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function preflightResponse(request, allowedOrigins) {
  const origin = request.headers.get('Origin');
  const allowsAnyOrigin = allowedOrigins.includes('*');
  const headers = new Headers({ Allow: 'GET, OPTIONS' });

  if (allowsAnyOrigin || isOriginAllowed(origin, allowedOrigins)) {
    headers.set('Access-Control-Allow-Origin', allowsAnyOrigin ? '*' : origin);
    headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
    headers.set('Access-Control-Max-Age', '86400');
    headers.set('Access-Control-Expose-Headers', 'X-Cache');
    if (!allowsAnyOrigin) {
      headers.set('Vary', 'Origin');
    }
  }

  return new Response(null, { status: 204, headers });
}
