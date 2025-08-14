// lib/notion.js
import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_TOKEN });

/**
 * Aliases tolérants pour retrouver tes colonnes (tu peux en ajouter)
 * - name/select/date/checkbox
 * - multi-select: plateformes
 * - media: on balaie toutes ces colonnes pour constituer un seul "carousel"
 */
const ALIAS = {
  name:            ["Name", "Titre du post", "Titre", "Post", "Nom"],
  description:     ["Description", "Desc", "Texte", "Content", "Body"],
  status:          ["Status", "Statut"],
  date:            ["Date", "Publish Date", "Post Date"],
  pinned:          ["Pinned", "Épingler", "Épinglé", "Epingle"],
  platforms:       ["Platforms", "Plateformes", "Social", "Réseaux", "Reseaux", "Réseau", "Platform"],
  // Toutes ces propriétés seront lues pour construire media[]
  mediaBuckets:    [
    "Image", "Images", "Visuel", "Visuels", "Media", "Médias", "Gallery", "Galerie", "Carousel",
    "Image URL", "Image URLs", "URL", "URLs", "Lien", "Liens", "Video", "Vidéos"
  ],
};

/** helpers */
const firstProp = (props, names) => {
  for (const n of names) if (props[n]) return props[n];
  return null;
};
const getPlainText = (rich) =>
  (rich || []).map(r => r.plain_text || "").join("").trim();

const isVideoExt = (url="") => /\.(mp4|mov|webm|m4v|mkv)$/i.test(url);
const extractUrls = (text="") => {
  const urls = [];
  const re = /(https?:\/\/[^\s<>"')]+)+/gi;
  let m; while ((m = re.exec(text)) !== null) urls.push(m[0]);
  return urls;
};

const proxify = (url) => {
  // Les URLs "file" de Notion expirent -> on passe par un proxy serverless
  // Pour les externes (Canva, CDN), on laisse tel quel
  try {
    const u = new URL(url);
    const isNotionS3 = /amazonaws\.com|secure\.notion-static\.com/i.test(u.host);
    return isNotionS3 ? `/api/media?url=${encodeURIComponent(url)}` : url;
  } catch {
    return url;
  }
};

function pushMedia(list, url) {
  if (!url) return;
  const type = isVideoExt(url) ? "video" : "image";
  list.push({ type, url: proxify(url) });
}

function collectMediaFromProperty(acc, prop) {
  if (!prop) return acc;

  // Files & media
  if (prop.type === "files") {
    for (const f of prop.files || []) {
      if (f.type === "file")  pushMedia(acc, f.file?.url);
      if (f.type === "external") pushMedia(acc, f.external?.url);
    }
    return acc;
  }

  // URL (champ Notion "URL")
  if (prop.type === "url" && prop.url) {
    pushMedia(acc, prop.url);
    return acc;
  }

  // Rich text (plusieurs liens séparés par espaces/retours)
  if (prop.type === "rich_text") {
    const txt = getPlainText(prop.rich_text);
    const urls = extractUrls(txt);
    urls.forEach(u => pushMedia(acc, u));
    return acc;
  }

  // Title (au cas où tu mets un lien dedans)
  if (prop.type === "title") {
    const txt = getPlainText(prop.title);
    const urls = extractUrls(txt);
    urls.forEach(u => pushMedia(acc, u));
    return acc;
  }

  return acc;
}

export async function fetchPosts({ databaseId, pageSize = 100 }) {
  const all = [];
  let cursor = undefined;

  do {
    const resp = await notion.databases.query({
      database_id: databaseId,
      page_size: Math.min(pageSize, 100),
      start_cursor: cursor,
      sorts: [
        { property: firstExistingSortKey(resp?.results?.[0]?.properties) || "Last edited time", direction: "descending" }
      ]
    });
    for (const page of resp.results) {
      const props = page.properties || {};

      // Nom
      const nameProp = firstProp(props, ALIAS.name) || props["Name"];
      const name = nameProp?.type === "title" ? getPlainText(nameProp.title) : "";

      // Description
      const descProp = firstProp(props, ALIAS.description);
      const description =
        descProp?.type === "rich_text" ? getPlainText(descProp.rich_text) : "";

      // Status (select)
      const statusProp = firstProp(props, ALIAS.status);
      const status = statusProp?.type === "select" ? statusProp.select?.name || "" : "";

      // Date
      const dateProp = firstProp(props, ALIAS.date);
      const date = dateProp?.type === "date" ? (dateProp.date?.start || "") : "";

      // Pinned
      const pinProp = firstProp(props, ALIAS.pinned);
      const pinned = pinProp?.type === "checkbox" ? !!pinProp.checkbox : false;

      // Platforms (multi-select)
      const platProp = firstProp(props, ALIAS.platforms);
      const platforms =
        platProp?.type === "multi_select"
          ? (platProp.multi_select || []).map(x => x.name).filter(Boolean)
          : [];

      // Media : on balaie toutes les colonnes mediaBuckets
      const media = [];
      for (const key of ALIAS.mediaBuckets) {
        if (props[key]) collectMediaFromProperty(media, props[key]);
      }

      // fallback : si rien trouvé, tente "Image" par défaut
      if (media.length === 0 && props["Image"]) {
        collectMediaFromProperty(media, props["Image"]);
      }

      // encore rien ? ignore cette page
      if (!name && media.length === 0) continue;

      all.push({
        id: page.id,
        name,
        description,
        status,
        date,
        pinned,
        platforms,
        media
      });
    }

    cursor = resp.has_more ? resp.next_cursor : undefined;
  } while (cursor);

  return all;
}

/**
 * Essaie de deviner une propriété triable si disponible.
 * Si pas trouvée, Notion utilisera "Last edited time".
 */
function firstExistingSortKey(props = {}) {
  const known = ["Date", ...ALIAS.date, "Created time", "Last edited time"];
  return known.find(k => props[k]);
}
