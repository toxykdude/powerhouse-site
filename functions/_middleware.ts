// Cloudflare Pages Function — Root middleware (host canonicalization)
// Runs for EVERY request to the project, including static assets
// (documented Pages behavior for a root functions/_middleware file).
//
// Why this exists: the site is reachable on several hosts that serve
// identical indexable content — https://www.powerhousegym.co/,
// https://powerhouse-site.pages.dev/ and every PR preview deployment
// <hash>.powerhouse-site.pages.dev. Google crawled those duplicates and
// the site ended up sitewide in "Crawled – currently not indexed"
// (GSC Page Indexing report, Sep 2026).
//
// Policy:
//   1. www.powerhousegym.co            → 301 to https://powerhousegym.co
//   2. powerhouse-site.pages.dev       → 301 to https://powerhousegym.co
//      (production alias of this Pages project)
//   3. <hash>.powerhouse-site.pages.dev → pass through with
//      X-Robots-Tag: noindex (keeps PR previews usable for developers
//      while removing them from Google's index)
//   4. powerhousegym.co                → pass through untouched

const CANONICAL_HOST = "powerhousegym.co";
const PAGES_PROD_HOST = "powerhouse-site.pages.dev";

function redirectCanonical(pathname: string, search: string): Response {
  return Response.redirect(
    `https://${CANONICAL_HOST}${pathname}${search}`,
    301,
  );
}

export const onRequest = async ({
  request,
  next,
}: {
  request: Request;
  next: () => Promise<Response>;
}) => {
  const url = new URL(request.url);
  const host = url.hostname.toLowerCase();

  // www subdomain and the pages.dev production alias are full duplicates:
  // consolidate them permanently into the canonical apex host.
  if (host === `www.${CANONICAL_HOST}` || host === PAGES_PROD_HOST) {
    return redirectCanonical(url.pathname, url.search);
  }

  // Any other host serving this project is a deploy/PR preview.
  // Keep it functional for the team but invisible to search engines.
  if (host !== CANONICAL_HOST) {
    const response = await next();
    const headers = new Headers(response.headers);
    headers.set("X-Robots-Tag", "noindex, nofollow");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  return next();
};
