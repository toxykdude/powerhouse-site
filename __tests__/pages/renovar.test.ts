import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Page-data tests (design testing strategy: "page-data tests where the
 * harness allows"). Astro pages render client-side flows inside inline
 * <script> blocks that vitest cannot execute, so we assert on the page
 * source itself — the same technique the repo uses for SSG pages.
 */

function pageSource(relativePath: string): string {
  return readFileSync(resolve(__dirname, relativePath), "utf-8");
}

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

describe("portal/renovar.astro — facegymId single source (D7)", () => {
  const source = pageSource("../../src/pages/portal/renovar.astro");

  it("contains no hardcoded FaceGYM plan UUIDs", () => {
    expect(UUID_RE.test(source)).toBe(false);
  });

  it("consumes facegymPlanId from the signature response", () => {
    expect(source).toContain("facegymPlanId");
    // Both backend calls (pending-payment + renew backup) must use the
    // server-provided id, not a local constant.
    const pendingBodyMatch = source.match(
      /body: JSON\.stringify\(\{[\s\S]*?plan_id: ([^,\n]+),[\s\S]*?wompi_reference: sigData\.reference,/,
    );
    expect(pendingBodyMatch).toBeTruthy();
    expect(pendingBodyMatch?.[1].trim()).toBe("sigData.facegymPlanId");
  });

  it("fails closed when the signature response carries no facegymPlanId", () => {
    expect(source).toMatch(
      /if\s*\(!sigData\.facegymPlanId\)/,
    );
  });
});
