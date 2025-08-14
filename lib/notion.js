// lib/notion.js
import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_TOKEN });

/**
 * Aliases de colonnes (ajoute/retire des noms si besoin)
 */
const ALIAS = {
  name:        ["Name", "Titre du post", "Titre", "Post", "Nom"],
  description: ["Description", "Desc", "Texte", "Content", "Body"],
  status:      ["Status", "Statut"],
  date:        ["Date", "Publish Date", "Post Date"],
  pinned:      ["Pinned", "Épingler", "Épinglé", "Epingle"],
  platforms:   ["Platforms", "Plateformes", "Social", "Réseaux", "Reseaux", "Réseau", "Platform"],
  mediaBuckets:[
    "Image","Images","Visuel","Visuels","Media","Médias","Gallery","Galerie","Carousel",
    "Image URL","Image URLs","URL","URLs","Lien","Liens","Video","Vidéos"
  ],
};

// ---- helpers ----
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

  if (prop.type === "files") {
    for (const f of prop.files || []) {
      if (f.type === "file")     pushMedia(acc, f.file?.url);
      if (f.type === "external") pushMedia(acc, f.external?.url);
    }
    return acc;
  }
  if (prop.type === "url" && prop.url) {
    pushMedia(acc, prop.url);
    return acc;
  }
  if (prop.type === "rich_text") {
    const txt = getPlainText(prop.rich_text);
    extractUrls(txt).forEach(u => pushMedia(acc, u));
    return acc;
  }
  if (prop.type === "title") {
    const txt = getPlainText(prop.title);
    extractUrls(txt).forEach(u => pushMedia(acc, u));
    return acc;
  }
  return acc;
}

// ---- main ----
export async function fetchPosts({ databaseId, pageSize = 100 }) {
  const all = [];
  let cursor = undefined;

  do {
    const resp = await notion.databases.query({
      database_id: databaseId,
      page_size: Math.min(pageSize, 100),
      start_cursor: cursor,
      // PAS de "sorts" ici (on trie côté front/pinned/date).
    });

    for (const page of resp.results) {
      const props = page.properties || {};

      // Nom / titre
      const nameProp = firstProp(props, ALIAS.name) || props["Name"];
      const name = nameProp?.type === "title" ? getPlainText(nameProp.title) : "";

      // Description
      const descProp = firstProp(props, ALIAS.description);
      const description =
        descProp?.type === "rich_text" ? getPlainText(descProp.rich_text) : "";

      // Statut
      const statusProp = firstProp(props, ALIAS.status);
      const status = statusProp?.type === "select" ? (statusProp.select?.name || "") : "";

      // Date
      const dateProp = firstProp(props, ALIAS.date);
      const date = dateProp?.type === "date" ? (dateProp.date?.start || "") : "";

      // Pinned
      const pinProp = firstProp(props, ALIAS.pinned);
      const pinned = pinProp?.type === "checkbox" ? !!pinProp.checkbox : false;

      // Plateformes
      const platProp = firstProp(props, ALIAS.platforms);
      const platforms =
        platProp?.type === "multi_select"
          ? (platProp.multi_select || []).map(x => x.name).filter(Boolean)
          : [];

      // Media (consolide toutes les colonnes possibles)
      const media = [];
      for (const key of ALIAS.mediaBuckets) {
        if (props[key]) collectMediaFromProperty(media, props[key]);
      }
      if (media.length === 0 && props["Image"]) {
        collectMediaFromProperty(media, props["Image"]);
      }

      // Ignorer si rien d’utile
      if (!name && media.length === 0) continue;

      all.push({ id: page.id, name, description, status, date, pinned, platforms, media });
    }

    cursor = resp.has_more ? resp.next_cursor : undefined;
  } while (cursor);

  return all;
}
