import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Mock the Workers-only TCP API with a scripted SMTP server.
 *
 * The client's command sequence is deterministic for a given path, so the
 * fake server responds by WRITE INDEX: responsePlan[i] = lines to queue
 * after the i-th client write. The greeting is pre-queued. Both the plain
 * and the post-STARTTLS socket read from the same shared line queue.
 */
vi.mock("cloudflare:sockets", () => {
  const state: {
    writes: string[];
    closed: boolean;
  } = { writes: [], closed: false };

  /** Per-socket line queue + waiter — a socket's reads only see its own lines. */
  interface Lane {
    queue: string[];
    waiter: (() => void) | null;
  }

  function wake(lane: Lane): void {
    const waiter = lane.waiter;
    if (waiter) {
      lane.waiter = null;
      waiter();
    }
  }

  function readableFromLane(lane: Lane): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream<Uint8Array>({
      async pull(controller) {
        while (lane.queue.length === 0) {
          await new Promise<void>((resolve) => {
            lane.waiter = resolve;
          });
        }
        controller.enqueue(encoder.encode(`${lane.queue.shift()}\r\n`));
      },
    });
  }

  function writableFromPlan(
    lane: Lane,
    plan: string[][],
    counter: { index: number },
  ): WritableStream<Uint8Array> {
    const decoder = new TextDecoder();
    return new WritableStream<Uint8Array>({
      write(chunk) {
        const text = decoder.decode(chunk);
        state.writes.push(text.replace(/\r\n$/, ""));
        lane.queue.push(...(plan[counter.index] ?? []));
        counter.index += 1;
        wake(lane);
      },
    });
  }

  const connect = vi.fn();

  return {
    connect,
    __state: state,
    __setup: (responsePlan: string[][], greeting: string[]) => {
      state.writes = [];
      state.closed = false;
      const counter = { index: 0 };
      const plainLane: Lane = { queue: [...greeting], waiter: null };
      const tlsLane: Lane = { queue: [], waiter: null };
      const tls = {
        readable: readableFromLane(tlsLane),
        writable: writableFromPlan(tlsLane, responsePlan, counter),
        closed: false,
        close() {
          tls.closed = true;
          state.closed = true;
        },
      };
      const plain = {
        readable: readableFromLane(plainLane),
        writable: writableFromPlan(plainLane, responsePlan, counter),
        closed: false,
        startTls() {
          return tls;
        },
        close() {
          plain.closed = true;
          state.closed = true;
        },
      };
      connect.mockImplementation(() => plain);
    },
  };
});

import {
  buildMimeMessage,
  sendViaSmtp,
} from "../../functions/api/evaluations/_gmail-smtp";
import { getEmailProvider } from "../../functions/api/evaluations/_email";
import type { Env } from "../../functions/api/evaluations/_types";

const INPUT = {
  from: "powerhousegymmanizales@gmail.com",
  fromName: "PowerHouse GYM Evaluaciones",
  to: "support@powerhousegym.co",
  replyTo: "support@powerhousegym.co",
  subject: "Evaluación de Harold Giraldo — 5.0/5 · PowerHouse GYM",
  text: "Reporte en texto plano con acentos: ó í",
  html: "<p>Reporte <strong>HTML</strong></p>",
};

const smtpMock = await import("cloudflare:sockets");

/** Standard successful dialogue, by write index (greeting pre-queued). */
function happyPlan(): string[][] {
  return [
    ["250-mta.gmail.com", "250 SMTPUTF8"], // 0: EHLO (plain)
    ["220 2.0.0 Ready to start TLS"], // 1: STARTTLS
    ["250-mta.gmail.com", "250 SMTPUTF8"], // 2: EHLO (tls)
    ["334 " + btoa("Username:")], // 3: AUTH LOGIN
    ["334 " + btoa("Password:")], // 4: base64(user)
    ["235 2.7.0 Accepted"], // 5: base64(password)
    ["250 2.1.0 OK"], // 6: MAIL FROM
    ["250 2.1.5 OK"], // 7: RCPT TO
    ["354 Go ahead"], // 8: DATA
    ["250 2.0.0 OK queued"], // 9: <mime>\r\n.\r\n
    ["221 2.0.0 closing"], // 10: QUIT
  ];
}

function setup(plan: string[][]): void {
  (
    smtpMock as unknown as { __setup: (p: string[][], g: string[]) => void }
  ).__setup(plan, ["220 smtp.gmail.com ESMTP xxi - gsmtp"]);
}

function writes(): string[] {
  return (smtpMock as unknown as { __state: { writes: string[] } }).__state
    .writes;
}

// ---------------------------------------------------------------------------
// MIME builder
// ---------------------------------------------------------------------------

describe("buildMimeMessage", () => {
  it("encodes the subject as an RFC 2047 encoded-word that round-trips", () => {
    const mime = buildMimeMessage(INPUT);
    const match = mime.match(/^Subject: =\?UTF-8\?B\?(.+)\?=$/m);
    expect(match).toBeTruthy();
    const decoded = atob(match![1]);
    const utf8 = new TextDecoder().decode(
      Uint8Array.from(decoded, (c) => c.charCodeAt(0)),
    );
    expect(utf8).toBe(INPUT.subject);
  });

  it("contains the required RFC 5322 headers", () => {
    const mime = buildMimeMessage(INPUT);
    expect(mime).toMatch(/^From: .*<powerhousegymmanizales@gmail\.com>$/m);
    expect(mime).toMatch(/^To: <support@powerhousegym\.co>$/m);
    expect(mime).toMatch(/^Reply-To: <support@powerhousegym\.co>$/m);
    expect(mime).toMatch(/^Date: /m);
    expect(mime).toMatch(/^Message-ID: <.+@powerhousegym\.co>$/m);
    expect(mime).toMatch(/^MIME-Version: 1\.0$/m);
    expect(mime).toMatch(
      /^Content-Type: multipart\/alternative; boundary="ph-eval-/m,
    );
  });

  it("base64 body parts round-trip to the original content", () => {
    const mime = buildMimeMessage(INPUT);
    const parts = mime
      .split(/--ph-eval-[0-9a-f]+/)
      .filter((part) => part.includes("Content-Transfer-Encoding: base64"));
    expect(parts).toHaveLength(2);
    const decode = (part: string) => {
      const b64 = part
        .split("Content-Transfer-Encoding: base64")[1]
        .replace(/\s+/g, "");
      const binary = atob(b64);
      return new TextDecoder().decode(
        Uint8Array.from(binary, (c) => c.charCodeAt(0)),
      );
    };
    expect(decode(parts[0])).toBe(INPUT.text);
    expect(decode(parts[1])).toBe(INPUT.html);
  });
});

// ---------------------------------------------------------------------------
// SMTP dialogue (scripted fake socket)
// ---------------------------------------------------------------------------

describe("sendViaSmtp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("completes the STARTTLS + AUTH LOGIN + DATA dialogue", async () => {
    setup(happyPlan());

    const result = await sendViaSmtp(
      {
        host: "smtp.gmail.com",
        port: 587,
        user: "user@gmail.com",
        password: "abcd efgh ijkl mnop",
      },
      INPUT,
    );

    expect(result.ok).toBe(true);
    const lines = writes();
    expect(lines[0]).toBe("EHLO powerhousegym.co");
    expect(lines[1]).toBe("STARTTLS");
    expect(lines[3]).toBe("AUTH LOGIN");
    expect(lines[4]).toBe(btoa("user@gmail.com"));
    // App-password spaces must be stripped before base64.
    expect(lines[5]).toBe(btoa("abcdefghijklmnop"));
    expect(lines[6]).toBe("MAIL FROM:<user@gmail.com>");
    expect(lines[7]).toBe("RCPT TO:<support@powerhousegym.co>");
    expect(lines[8]).toBe("DATA");
    // The DATA payload is one write: full MIME + terminator.
    expect(lines[9]).toContain("Subject: =?UTF-8?B?");
    // The mock strips one trailing CRLF, so the terminator is "\r\n.".
    expect(lines[9]).toContain("\r\n.");
    expect(lines[9].endsWith("\r\n.")).toBe(true);
    expect(lines[10]).toBe("QUIT");
    expect(
      (smtpMock as unknown as { __state: { closed: boolean } }).__state.closed,
    ).toBe(true);
  });

  it("reports failure when Gmail rejects the app password", async () => {
    const plan = happyPlan();
    plan[5] = ["535 5.7.8 Username and Password not accepted"];
    setup(plan);

    const result = await sendViaSmtp(
      {
        host: "smtp.gmail.com",
        port: 587,
        user: "user@gmail.com",
        password: "wrong",
      },
      INPUT,
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("app password");
  });

  it("reports failure when the server greeting is wrong", async () => {
    (
      smtpMock as unknown as { __setup: (p: string[][], g: string[]) => void }
    ).__setup(happyPlan(), ["554 connection refused"]);

    const result = await sendViaSmtp(
      { host: "smtp.gmail.com", port: 587, user: "u@gmail.com", password: "x" },
      INPUT,
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("greeting");
  });
});

// ---------------------------------------------------------------------------
// Provider wiring
// ---------------------------------------------------------------------------

describe("getEmailProvider (gmail)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes through SMTP with env config and the support inbox", async () => {
    setup(happyPlan());

    const provider = getEmailProvider({
      EMAIL_PROVIDER: "gmail",
      SMTP_HOST: "smtp.gmail.com",
      SMTP_PORT: "587",
      SMTP_USER: "powerhousegymmanizales@gmail.com",
      SMTP_PASSWORD: "xnwa dijj ksvz mnlq",
    } as unknown as Env);

    const result = await provider.send({
      subject: INPUT.subject,
      html: INPUT.html,
      text: INPUT.text,
    });

    expect(result.ok).toBe(true);
    const lines = writes();
    expect(lines[4]).toBe(btoa("powerhousegymmanizales@gmail.com"));
    expect(lines[5]).toBe(btoa("xnwadijjksvzmnlq"));
    expect(lines[7]).toBe("RCPT TO:<support@powerhousegym.co>");
    expect(lines[9]).toMatch(
      /^From: =\?UTF-8\?B\?.+\?= <powerhousegymmanizales@gmail\.com>/m,
    );
  });
});
