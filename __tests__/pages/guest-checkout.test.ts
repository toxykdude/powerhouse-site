import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Page-data tests (design testing strategy: "page-data tests where the
 * harness allows"). The guest checkout and confirmation flows are inline
 * client scripts inside SSG pages, so we assert on the page source.
 */

function pageSource(relativePath: string): string {
  return readFileSync(resolve(__dirname, relativePath), "utf-8");
}

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

// ---------------------------------------------------------------------------
// /comprar — guest checkout (design D10, guest-purchase spec)
// ---------------------------------------------------------------------------

describe("comprar.astro — guest checkout", () => {
  const source = pageSource("../../src/pages/comprar.astro");

  it("exists and only offers the four gym plans", () => {
    expect(source).toContain("mensual");
    expect(source).toContain("trimestral");
    expect(source).toContain("semestral");
    expect(source).toContain("anual");
    expect(source).not.toContain('"pt-');
  });

  it("refuses pt-* plans and directs to the manual staff path", () => {
    expect(source).toMatch(/pt-/);
    expect(source).toMatch(/startsWith\('pt-'\)|startsWith\("pt-"\)/);
    // manual direction: WhatsApp contact
    expect(source).toContain("wa.me");
  });

  it("captures guest identity: name, phone, email", () => {
    expect(source).toMatch(/guest_name|guestName/);
    expect(source).toMatch(/guest_phone|guestPhone/);
    expect(source).toMatch(/guest_email|guestEmail/);
  });

  it("stores the pending record through the proxy before the widget opens", () => {
    expect(source).toContain("/api/portal/pending-payment-guest");
    expect(source).toContain("/api/payment/signature");
    // pending POST is awaited before WidgetCheckout is constructed
    const pendingIdx = source.indexOf("pending-payment-guest");
    const widgetIdx = source.indexOf("new WidgetCheckout");
    expect(pendingIdx).toBeGreaterThan(-1);
    expect(widgetIdx).toBeGreaterThan(pendingIdx);
  });

  it("sends exactly the five guest fields — no client-authored amount", () => {
    // Extract the JSON.stringify body sent to the proxy (scoped to the
    // fetch call that targets pending-payment-guest)
    const proxyIdx = source.indexOf("/api/portal/pending-payment-guest");
    const afterProxy = source.slice(proxyIdx);
    const bodyMatch = afterProxy.match(
      /body: JSON\.stringify\(\{([\s\S]*?)\}\),/,
    );
    expect(bodyMatch).toBeTruthy();
    const fields = bodyKeyNames(bodyMatch![1]);
    expect(fields).toContain("wompi_reference");
    expect(fields).toContain("guest_name");
    expect(fields).toContain("guest_phone");
    expect(fields).toContain("guest_email");
    expect(fields).toContain("plan_id");
    expect(fields).not.toContain("amount");
    expect(fields).not.toContain("amountInCents");
    expect(fields).not.toContain("amount_in_cents");
  });

  it("takes the plan id from the signature response, never a hardcoded UUID", () => {
    expect(UUID_RE.test(source)).toBe(false);
    expect(source).toContain("facegymPlanId");
  });

  it("fails closed when the signature response has no facegymPlanId", () => {
    expect(source).toMatch(/!.*facegymPlanId/);
  });

  it("escapes interpolations before injecting into the DOM", () => {
    expect(source).toContain("escapeHtml");
  });

  it("validates the phone client-side (Colombian mobile)", () => {
    expect(source).toMatch(/\\d\{10\}|57\\d\{10\}/);
  });
});

function bodyKeyNames(bodyLiteral: string): string[] {
  const keys: string[] = [];
  const re = /([A-Za-z_][A-Za-z0-9_]*)\s*:/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bodyLiteral))) keys.push(m[1]);
  return keys;
}

// ---------------------------------------------------------------------------
// planes.astro — guest CTA routes to /comprar (no direct Wompi flow)
// ---------------------------------------------------------------------------

describe("planes.astro — guest CTA", () => {
  const source = pageSource("../../src/pages/planes.astro");

  it("routes gym-plan buttons to the guest checkout page", () => {
    expect(source).toMatch(/\/comprar\?plan=/);
  });

  it("no longer opens the Wompi widget directly", () => {
    expect(source).not.toContain("new WidgetCheckout");
  });
});

// ---------------------------------------------------------------------------
// /pago/confirmacion — honest copy (design D11)
// ---------------------------------------------------------------------------

describe("pago/confirmacion.astro — honest confirmation copy", () => {
  const source = pageSource("../../src/pages/pago/confirmacion.astro");

  it("directs enrollment to the gym for approved purchases", () => {
    const approvedBlock = extractStateBlock(source, "stateApproved");
    expect(approvedBlock).toBeTruthy();
    expect(approvedBlock).toMatch(/[Cc]ompra registrada/);
    expect(approvedBlock).toMatch(/registro facial|activa tu membresía en el gimnasio/);
  });

  it("never claims active membership or kiosk access", () => {
    expect(source).not.toContain("membresía está activa");
    expect(source).not.toContain(/acceso inmediato/i);
    expect(source).not.toContain(/inscrito\/a en biometría/i);
  });

  it("non-approved states show no success copy", () => {
    const pendingBlock = extractStateBlock(source, "statePending");
    const declinedBlock = extractStateBlock(source, "stateDeclined");
    for (const block of [pendingBlock, declinedBlock]) {
      expect(block).toBeTruthy();
      expect(block).not.toMatch(/exitoso|EXITOSO/);
      expect(block).not.toMatch(/[Cc]ompra registrada/);
    }
  });
});

function extractStateBlock(source: string, stateId: string): string {
  const start = source.indexOf(`id="${stateId}"`);
  if (start === -1) return "";
  // The state div ends where the next <!-- state comment --> or card end begins
  const rest = source.slice(start);
  const nextComment = rest.search(/<!--\s*\w/);
  return nextComment === -1 ? rest : rest.slice(0, nextComment);
}
