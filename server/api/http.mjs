/* Small HTTP helpers shared by the API routes.

   HttpError is the only error shape that reaches the client: the route handler
   turns anything else into a 500 so internal detail never leaks.
*/

export const JSON_LIMIT = 16 * 1024;

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const send = (res, status, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
};

export const fail = (res, status, code, message) =>
  send(res, status, { error: { code, message } });

export async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > JSON_LIMIT) {
      throw new HttpError(413, 'payload_too_large', 'Request body is too large');
    }
  }
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'invalid_json', 'Request body is not valid JSON');
  }
}
