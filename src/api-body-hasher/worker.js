async function sha256Hex(data) {
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function withAmzContentSha256(request) {
  if (request.body === null) {
    return request;
  }

  if (
    request.method === "GET" ||
    request.method === "HEAD" ||
    request.method === "OPTIONS"
  ) {
    return request;
  }

  const payload = await request.clone().arrayBuffer();
  const hashHex = await sha256Hex(payload);

  const headers = new Headers(request.headers);
  headers.set("x-amz-content-sha256", hashHex);

  return new Request(request, { headers });
}

export default {
  async fetch(request) {
    const requestWithHash = await withAmzContentSha256(request);
    return fetch(requestWithHash);
  },
};
