export function jsonResponse(payload, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...headers,
    },
  });
}

export function successResponse(data, { status = 200, headers = {} } = {}) {
  return jsonResponse({ success: true, data }, { status, headers });
}

export function errorResponse(status, code, message, { headers = {} } = {}) {
  return jsonResponse({ success: false, error: { code, message } }, { status, headers });
}
