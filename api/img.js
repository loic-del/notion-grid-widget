// /api/img?url=ENCODED_URL
export default async function handler(req, res) {
  const target = req.query.url;
  if (!target) {
    res.status(400).send("Missing url");
    return;
  }

  try {
    // 1) on récupère la ressource (autorise les redirections)
    const resp = await fetch(target, {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/*,*/*;q=0.8",
      },
    });

    if (!resp.ok) throw new Error(`Upstream ${resp.status}`);

    let ct = (resp.headers.get("content-type") || "").toLowerCase();

    // 2) Si c'est déjà une image → on stream direct
    if (ct.startsWith("image/")) {
      const buf = Buffer.from(await resp.arrayBuffer());
      res.setHeader("Content-Type", ct);
      res.setHeader(
        "Cache-Control",
        "public, s-maxage=86400, max-age=86400, stale-while-revalidate=604800"
      );
      res.status(200).send(buf);
      return;
    }

    // 3) Si c'est de l'HTML (ex: Canva), on extrait og:image / twitter:image
    if (ct.includes("text/html")) {
      const html = await resp.text();

      // cherche og:image / og:image:secure_url / twitter:image
      const m =
        html.match(/<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);

      if (m && m[1]) {
        const imgUrl = m[1];
        // On refait un fetch de cette image
        const imgResp = await fetch(imgUrl, {
          redirect: "follow",
          headers: { "User-Agent": "Mozilla/5.0" },
        });
        if (!imgResp.ok) throw new Error(`OG image upstream ${imgResp.status}`);

        const imgCt = imgResp.headers.get("content-type") || "image/jpeg";
        const buf = Buffer.from(await imgResp.arrayBuffer());
        res.setHeader("Content-Type", imgCt);
        res.setHeader(
          "Cache-Control",
          "public, s-maxage=86400, max-age=86400, stale-while-revalidate=604800"
        );
        res.status(200).send(buf);
        return;
      }
    }

    // 4) fallback : petit SVG “Image unavailable”
    res
      .status(200)
      .setHeader("Content-Type", "image/svg+xml")
      .send(
        `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200"><rect width="100%" height="100%" fill="#e5e7eb"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="32" fill="#9ca3af">Image unavailable</text></svg>`
      );
  } catch (e) {
    console.error("IMG proxy error:", e?.message || e);
    res
      .status(200)
      .setHeader("Content-Type", "image/svg+xml")
      .send(
        `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200"><rect width="100%" height="100%" fill="#e5e7eb"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="32" fill="#9ca3af">Image unavailable</text></svg>`
      );
  }
}
