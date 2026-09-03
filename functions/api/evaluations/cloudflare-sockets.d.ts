/**
 * cloudflare-sockets.d.ts — ambient types for the Workers-only TCP sockets
 * API used by _gmail-smtp.ts. The module exists only in the Cloudflare
 * runtime (Pages Functions / Workers); tests mock it via vi.mock.
 */
declare module "cloudflare:sockets" {
  export interface Socket {
    readable: ReadableStream<Uint8Array>;
    writable: WritableStream<Uint8Array>;
    startTls(): Socket;
    close(): void;
    closed: boolean;
  }
  export function connect(
    address: { hostname: string; port: number },
    options?: { secureTransport?: "off" | "starttls" | "on" },
  ): Socket;
}
