export default async function handler(req, res) {
  const target = req.query.url;
  if (!target) {
    res.status(400).send("Missing url");
    return;
  }
  try {
    const r = await fetch(target, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) throw new Error(`Upstream ${r.status}`);
    // détecte le content-type si possible, sinon image/jpeg
    const ct = r.headers.get("content-type") || "image/jpeg";
    res.setHeader("Content-Type", ct);
    res.setHeader("Cache-Control", "public, s-maxage=86400, max-age=86400, stale-while-revalidate=604800");
    const buf = Buffer.from(await r.arrayBuffer());
    res.status(200).send(buf);
  } catch (e) {
    console.error("IMG proxy error:", e?.message || e);
    res.status(200).setHeader("Content-Type","image/svg+xml").send(
      `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200"><rect width="100%" height="100%" fill="#e5e7eb"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="32" fill="#9ca3af">Image unavailable</text></svg>`
    );
  }
}
