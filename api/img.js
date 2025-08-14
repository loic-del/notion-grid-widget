// /api/img?url=ENCODED_URL
export default async function handler(req, res) {
  const target = req.query.url;
  if (!target) {
    res.status(400).send("Missing url");
    return;
  }

  try {
    const r1 = await fetch(target, {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/*,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,fr;q=0.8",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
      },
    });

    if (!r1.ok) throw new Error(`Upstream ${r1.status}`);
    const ct1 = (r1.headers.get("content-type") || "").toLowerCase();

    // Déjà une image ? on stream directement
    if (ct1.startsWith("image/")) {
      const buf = Buffer.from(await r1.arrayBuffer());
      res.setHeader("Content-Type", ct1 || "image/jpeg");
      res.setHeader("Cache-Control", "public, s-maxage=86400, max-age=86400, stale-while-revalidate=604800");
      res.status(200).send(buf);
      return;
    }

    // HTML → extraire l'og:image / twitter:image
    if (ct1.includes("text/html")) {
      const html = await r1.text();
      // Essayes plusieurs variantes
      const rx = [
        /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+name=["']twitter:image:src["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
      ];
      let imgUrl = null;
      for (const re of rx) {
        const m = html.match(re);
        if (m && m[1]) { imgUrl = m[1]; break; }
      }

      if (imgUrl) {
        // Résoudre URL relative
        try { imgUrl = new URL(imgUrl, r1.url).toString(); } catch {}

        // Télécharge l'image finale (avec referer Canva au cas où)
        const r2 = await fetch(imgUrl, {
          redirect: "follow",
          headers: {
            "User-Agent": "Mozilla/5.0",
            "Referer": "https://www.canva.com/",
            "Accept": "image/avif,image/webp,image/*,*/*;q=0.8",
          },
        });
        if (!r2.ok) throw new Error(`OG image upstream ${r2.status}`);

        const ct2 = r2.headers.get("content-type") || "image/jpeg";
        const buf = Buffer.from(await r2.arrayBuffer());
        res.setHeader("Content-Type", ct2);
        res.setHeader("Cache-Control", "public, s-maxage=86400, max-age=86400, stale-while-revalidate=604800");
        res.status(200).send(buf);
        return;
      }
    }

    // Fallback SVG
    res
      .status(200)
      .setHeader("Content-Type", "image/svg+xml")
      .send(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200">
        <rect width="100%" height="100%" fill="#e5e7eb"/>
        <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
              font-family="sans-serif" font-size="32" fill="#9ca3af">Image unavailable</text>
      </svg>`);
  } catch (e) {
    console.error("IMG proxy error:", e?.message || e);
    res
      .status(200)
      .setHeader("Content-Type", "image/svg+xml")
      .send(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200">
        <rect width="100%" height="100%" fill="#e5e7eb"/>
        <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
              font-family="sans-serif" font-size="32" fill="#9ca3af">Image unavailable</text>
      </svg>`);
  }
}
