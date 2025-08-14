// /api/media?url=ENCODED_URL
export default async function handler(req, res) {
  const target = req.query.url;
  if (!target) return res.status(400).send("Missing url");

  try {
    const r1 = await fetch(target, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/*,video/*,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,fr;q=0.8",
      },
    });
    if (!r1.ok) throw new Error(`Upstream ${r1.status}`);

    const ct1 = (r1.headers.get("content-type") || "").toLowerCase();

    // Déjà image/vidéo → stream direct
    if (ct1.startsWith("image/") || ct1.startsWith("video/")) {
      const buf = Buffer.from(await r1.arrayBuffer());
      res.setHeader("Content-Type", ct1);
      res.setHeader("Cache-Control", "public, s-maxage=86400, max-age=86400, stale-while-revalidate=604800");
      return res.status(200).send(buf);
    }

    // HTML → cherche og:video / twitter:player:stream / og:image / twitter:image
    if (ct1.includes("text/html")) {
      const html = await r1.text();
      const tryMatch = (...regexes) => {
        for (const re of regexes) {
          const m = html.match(re);
          if (m && m[1]) return m[1];
        }
        return null;
      };

      // priorité vidéo
      let mediaUrl =
        tryMatch(
          /<meta[^>]+property=["']og:video:secure_url["'][^>]+content=["']([^"']+)["']/i,
          /<meta[^>]+property=["']og:video["'][^>]+content=["']([^"']+)["']/i,
          /<meta[^>]+name=["']twitter:player:stream["'][^>]+content=["']([^"']+)["']/i,
        ) ||
        tryMatch( // fallback image
          /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/i,
          /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
          /<meta[^>]+name=["']twitter:image:src["'][^>]+content=["']([^"']+)["']/i,
          /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
        );

      if (mediaUrl) {
        try { mediaUrl = new URL(mediaUrl, r1.url).toString(); } catch {}
        const r2 = await fetch(mediaUrl, {
          redirect: "follow",
          headers: {
            "User-Agent": "Mozilla/5.0",
            "Referer": "https://www.canva.com/",
            "Accept": "image/avif,image/webp,image/*,video/*,*/*;q=0.8",
          },
        });
        if (!r2.ok) throw new Error(`OG media upstream ${r2.status}`);
        const ct2 = r2.headers.get("content-type") || "application/octet-stream";
        const buf = Buffer.from(await r2.arrayBuffer());
        res.setHeader("Content-Type", ct2);
        res.setHeader("Cache-Control", "public, s-maxage=86400, max-age=86400, stale-while-revalidate=604800");
        return res.status(200).send(buf);
      }
    }

    // Fallback
    res.status(200).setHeader("Content-Type","image/svg+xml").send(
      `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200"><rect width="100%" height="100%" fill="#e5e7eb"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="32" fill="#9ca3af">Media unavailable</text></svg>`
    );
  } catch (e) {
    console.error("MEDIA proxy error:", e?.message || e);
    res.status(200).setHeader("Content-Type","image/svg+xml").send(
      `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200"><rect width="100%" height="100%" fill="#e5e7eb"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="32" fill="#9ca3af">Media unavailable</text></svg>`
    );
  }
}
