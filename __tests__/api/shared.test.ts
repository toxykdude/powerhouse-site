import { describe, it, expect, vi, beforeEach } from "vitest";
import { jsonResponse, CORS_HEADERS, proxyToFaceGYM } from "../../functions/api/_shared";

// ---------------------------------------------------------------------------
// CORS_HEADERS
// ---------------------------------------------------------------------------

describe("CORS_HEADERS", () => {
  it("allows the production origin", () => {
    expect(CORS_HEADERS["Access-Control-Allow-Origin"]).toBe(
      "https://powerhousegym.co",
    );
  });

  it("includes all required HTTP methods", () => {
    const methods =
      CORS_HEADERS["Access-Control-Allow-Methods"].split(",").map((m) => m.trim());
    expect(methods).toContain("GET");
    expect(methods).toContain("POST");
    expect(methods).toContain("PUT");
    expect(methods).toContain("DELETE");
    expect(methods).toContain("OPTIONS");
  });

  it("allows Content-Type and Authorization headers", () => {
    const headers =
      CORS_HEADERS["Access-Control-Allow-Headers"].split(",").map((h) => h.trim());
    expect(headers).toContain("Content-Type");
    expect(headers).toContain("Authorization");
  });
});

// ---------------------------------------------------------------------------
// jsonResponse
// ---------------------------------------------------------------------------

describe("jsonResponse", () => {
  it("returns a JSON response with the given status", async () => {
    const response = jsonResponse({ ok: true }, 200);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://powerhousegym.co",
    );

    const body = await response.json();
    expect(body).toEqual({ ok: true });
  });

  it("returns error responses with CORS headers", async () => {
    const response = jsonResponse({ error: "Not found" }, 404);

    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toBe("application/json");

    const body = await response.json();
    expect(body).toEqual({ error: "Not found" });
  });

  it("serializes complex objects correctly", async () => {
    const data = { items: [1, 2, 3], nested: { key: "value" } };
    const response = jsonResponse(data, 200);
    const body = await response.json();
    expect(body).toEqual(data);
  });
});

// ---------------------------------------------------------------------------
// proxyToFaceGYM
// ---------------------------------------------------------------------------

describe("proxyToFaceGYM", () => {
  const MOCK_ENV = { FACEGYM_API_URL: "https://test-api.example.com" };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 204 with CORS headers for OPTIONS preflight", async () => {
    const request = new Request("https://powerhousegym.co/api/test", {
      method: "OPTIONS",
    });

    const response = await proxyToFaceGYM(request, MOCK_ENV, "/api/test");

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://powerhousegym.co",
    );
  });

  it("proxies GET requests with Authorization header", async () => {
    const mockResponseBody = JSON.stringify({ user: "test" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(mockResponseBody, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const request = new Request("https://powerhousegym.co/api/auth/me", {
      method: "GET",
      headers: { Authorization: "Bearer test-token" },
    });

    const response = await proxyToFaceGYM(request, MOCK_ENV, "/api/auth/me");

    expect(response.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://test-api.example.com/api/auth/me",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
        }),
      }),
    );
  });

  it("proxies POST requests with body", async () => {
    const mockResponseBody = JSON.stringify({ success: true });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(mockResponseBody, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const request = new Request("https://powerhousegym.co/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token",
      },
      body: JSON.stringify({ phone: "1234567890" }),
    });

    const response = await proxyToFaceGYM(request, MOCK_ENV, "/api/auth/login");

    expect(response.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://test-api.example.com/api/auth/login",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ phone: "1234567890" }),
      }),
    );

    const body = await response.json();
    expect(body).toEqual({ success: true });
  });

  it("strips access-control headers from upstream response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("ok", {
        status: 200,
        headers: {
          "Content-Type": "text/plain",
          "Access-Control-Allow-Origin": "https://evil.com",
          "X-Custom": "value",
        },
      }),
    );

    const request = new Request("https://powerhousegym.co/api/test", {
      method: "GET",
    });

    const response = await proxyToFaceGYM(request, MOCK_ENV, "/api/test");

    // Our CORS headers should be present
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://powerhousegym.co",
    );
    // Custom header should be forwarded
    expect(response.headers.get("X-Custom")).toBe("value");
  });

  it("preserves query string from original URL", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"));

    const request = new Request(
      "https://powerhousegym.co/api/test?foo=bar&baz=1",
      { method: "GET" },
    );

    await proxyToFaceGYM(request, MOCK_ENV, "/api/test");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://test-api.example.com/api/test?foo=bar&baz=1",
      expect.anything(),
    );
  });

  it("defaults to faceapp.powerhousegym.co when FACEGYM_API_URL is not set", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"));

    const request = new Request("https://powerhousegym.co/api/test", {
      method: "GET",
    });

    await proxyToFaceGYM(request, {}, "/api/test");

    const calledUrl = String(vi.mocked(globalThis.fetch).mock.calls[0][0]);
    expect(calledUrl).toMatch(/^https:\/\/faceapp\.powerhousegym\.co/);
  });

  it("strips trailing slash from FACEGYM_API_URL", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"));

    const request = new Request("https://powerhousegym.co/api/test", {
      method: "GET",
    });

    await proxyToFaceGYM(
      request,
      { FACEGYM_API_URL: "https://api.example.com/" },
      "/api/test",
    );

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.example.com/api/test",
      expect.anything(),
    );
  });

  it("returns 502 when upstream is unreachable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network error"));

    const request = new Request("https://powerhousegym.co/api/test", {
      method: "GET",
    });

    const response = await proxyToFaceGYM(request, MOCK_ENV, "/api/test");

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });
});
