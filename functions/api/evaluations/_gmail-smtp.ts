/**
 * _gmail-smtp.ts — minimal SMTP client for Cloudflare Pages Functions.
 *
 * Sends the evaluation report through Gmail SMTP (app-password auth) using
 * the Workers TCP sockets API (cloudflare:sockets). No external deps:
 * STARTTLS (587) or implicit TLS (465), AUTH LOGIN, RFC 5322 MIME message
 * with UTF-8 encoded-word subject and base64 body parts.
 *
 * The dynamic import of "cloudflare:sockets" keeps vitest happy in Node
 * (tests mock the module via vi.mock).
 */

// --- Types -----------------------------------------------------------------

export interface SmtpConfig {
  host: string;
  port: number;
  /** Authenticated Gmail account — also the envelope sender. */
  user: string;
  /** App password (spaces stripped automatically). */
  password: string;
}

export interface MimeInput {
  from: string;
  fromName: string;
  to: string;
  replyTo: string;
  subject: string;
  text: string;
  html: string;
}

export interface SmtpResult {
  ok: boolean;
  error?: string;
}

// --- UTF-8 helpers -----------------------------------------------------------

function utf8Base64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** RFC 2047 encoded-word for non-ASCII headers (e.g. subjects with "ó"). */
function encodedWord(value: string): string {
  return `=?UTF-8?B?${utf8Base64(value)}?=`;
}

/** Wrap base64 payload at 76 chars per MIME convention. */
function wrap76(value: string): string {
  return value.replace(/(.{76})/g, "$1\r\n");
}

// --- MIME --------------------------------------------------------------------

/** RFC 5322 message with a multipart/alternative body (plain + html). */
export function buildMimeMessage(input: MimeInput): string {
  const boundary = `ph-eval-${crypto.randomUUID().replace(/-/g, "")}`;
  const date = new Date().toUTCString();
  const messageId = `<${crypto.randomUUID()}@powerhousegym.co>`;
  const headers = [
    `From: ${encodedWord(input.fromName)} <${input.from}>`,
    `To: <${input.to}>`,
    `Reply-To: <${input.replyTo}>`,
    `Subject: ${encodedWord(input.subject)}`,
    `Date: ${date}`,
    `Message-ID: ${messageId}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  const parts = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(utf8Base64(input.text)),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(utf8Base64(input.html)),
    `--${boundary}--`,
  ];
  return `${headers.join("\r\n")}\r\n\r\n${parts.join("\r\n")}\r\n`;
}

/** SMTP dot-stuffing: any line starting with "." gets doubled. */
function dotStuff(body: string): string {
  return body.replace(/(^|\r\n)\./g, "$1..");
}

// --- SMTP client ---------------------------------------------------------------

interface LineReader {
  read(): Promise<string | undefined>;
  /** Unlock the underlying stream (needed before startTls()). */
  release(): void;
}

function createLineReader(readable: ReadableStream<Uint8Array>): LineReader {
  const reader = readable.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  return {
    async read() {
      for (;;) {
        const newlineIndex = buffer.indexOf("\r\n");
        if (newlineIndex !== -1) {
          const line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 2);
          return line;
        }
        const { done, value } = await reader.read();
        if (done) {
          if (buffer.length === 0) return undefined;
          const line = buffer;
          buffer = "";
          return line;
        }
        buffer += decoder.decode(value, { stream: true });
      }
    },
    /** Unlock the stream — required before Socket.startTls(). */
    release() {
      reader.releaseLock();
    },
  };
}

/** Read one full SMTP response (handles "250-..." multiline continuations). */
async function readResponse(lineReader: LineReader): Promise<string> {
  let response = "";
  for (;;) {
    const line = await lineReader.read();
    if (line === undefined) {
      throw new Error(
        `smtp: connection closed${response ? ` after "${response}"` : ""}`,
      );
    }
    response += line;
    // A line like "250 OK" (space) ends the response; "250-SIZE..." continues.
    if (/^\d{3} /.test(line) || !/^\d{3}-/.test(line)) return response;
  }
}

function expect(response: string, code: string, step: string): void {
  if (!response.startsWith(code)) {
    throw new Error(
      `smtp ${step}: expected ${code}, got ${response.slice(0, 120)}`,
    );
  }
}

/**
 * Send one email via SMTP. Envelope sender = authenticated user (Gmail
 * requirement); destination comes from the MIME To: header.
 */
export async function sendViaSmtp(
  config: SmtpConfig,
  input: MimeInput,
): Promise<SmtpResult> {
  const password = config.password.replace(/\s+/g, "");
  const { connect } = await import("cloudflare:sockets");
  const useImplicitTls = config.port === 465;

  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("smtp: timed out after 20s")), 20_000),
    );
    const session = (async (): Promise<SmtpResult> => {
      let socket = connect(
        { hostname: config.host, port: config.port },
        { secureTransport: useImplicitTls ? "on" : "starttls" },
      );
      try {
        const writer = socket.writable.getWriter();
        const encoder = new TextEncoder();
        const send = (line: string) =>
          writer.write(encoder.encode(`${line}\r\n`));
        const lineReader = createLineReader(socket.readable);

        expect(await readResponse(lineReader), "220", "greeting");
        await send("EHLO powerhousegym.co");
        expect(await readResponse(lineReader), "250", "ehlo");

        if (!useImplicitTls) {
          await send("STARTTLS");
          expect(await readResponse(lineReader), "220", "starttls");
          // startTls() returns a NEW socket over the upgraded connection.
          writer.releaseLock();
          socket = socket.startTls();
          const tlsWriter = socket.writable.getWriter();
          const sendTls = (line: string) =>
            tlsWriter.write(encoder.encode(`${line}\r\n`));
          const tlsReader = createLineReader(socket.readable);
          await sendTls("EHLO powerhousegym.co");
          expect(await readResponse(tlsReader), "250", "ehlo(tls)");
          return await authenticateAndSubmit(
            tlsWriter,
            tlsReader,
            sendTls,
            config.user,
            password,
            input,
          );
        }
        return await authenticateAndSubmit(
          writer,
          lineReader,
          send,
          config.user,
          password,
          input,
        );
      } finally {
        try {
          socket.close();
        } catch {
          // already closed — nothing to do
        }
      }
    })();
    return await Promise.race([session, timeout]);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "smtp send failed",
    };
  }
}

type Writer = WritableStreamDefaultWriter<Uint8Array>;
type SendFn = (line: string) => Promise<void>;

async function authenticateAndSubmit(
  writer: Writer,
  lineReader: LineReader,
  send: SendFn,
  user: string,
  password: string,
  input: MimeInput,
): Promise<SmtpResult> {
  // AUTH LOGIN — Gmail accepts app passwords this way.
  await send("AUTH LOGIN");
  expect(await readResponse(lineReader), "334", "auth login");
  await send(btoa(user));
  expect(await readResponse(lineReader), "334", "auth user");
  await send(btoa(password));
  const authResponse = await readResponse(lineReader);
  if (!authResponse.startsWith("235")) {
    throw new Error(
      `smtp auth rejected (check app password): ${authResponse.slice(0, 120)}`,
    );
  }

  await send(`MAIL FROM:<${user}>`);
  expect(await readResponse(lineReader), "250", "mail from");
  await send(`RCPT TO:<${input.to}>`);
  expect(await readResponse(lineReader), "250", "rcpt to");
  await send("DATA");
  expect(await readResponse(lineReader), "354", "data");

  const mime = buildMimeMessage(input);
  await writer.write(new TextEncoder().encode(`${dotStuff(mime)}\r\n.\r\n`));
  expect(await readResponse(lineReader), "250", "message accepted");
  await send("QUIT");
  return { ok: true };
}
