// Cloudflare Worker: Media proxy for R2 bucket
// Serves files from powerhouse-media R2 bucket via media.powerhousegym.co
// Environment binding: MEDIA_BUCKET (R2 bucket binding)

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const key = url.pathname.slice(1); // Remove leading /

    // Root path - return 404
    if (!key || key === "") {
      return new Response("Not Found", { status: 404 });
    }

    // Don't serve .keep files (folder markers)
    if (key.endsWith(".keep")) {
      return new Response("Not Found", { status: 404 });
    }

    try {
      const object = await env.MEDIA_BUCKET.get(key);

      if (!object) {
        return new Response("Not Found", { status: 404 });
      }

      // Determine content type
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("etag", object.httpEtag);

      // Cache for 30 days
      headers.set("Cache-Control", "public, max-age=2592000, immutable");
      headers.set("Access-Control-Allow-Origin", "*");

      // Handle conditional requests
      if (request.headers.get("If-None-Match") === object.httpEtag) {
        return new Response(null, { status: 304, headers });
      }

      return new Response(object.body, { headers });
    } catch (error) {
      return new Response("Internal Server Error", { status: 500 });
    }
  },
};
