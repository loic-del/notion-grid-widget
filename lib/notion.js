// lib/notion.js
import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_TOKEN });

const ALIAS = {
  name:        ["Name", "Titre du post", "Titre", "Post", "Nom"],
  description: ["Description", "Desc", "Texte", "Content", "Body", "Caption"],
  status:      ["Status", "Statut"],
  date:        ["Date", "Publish Date", "Post Date"],
  pinned:      ["Pinned", "Épingler", "Épinglé", "Epingle"],
  platforms:   ["Platforms", "Plateformes", "Social", "Réseaux", "Reseaux", "Réseau", "Platform", "Channel"],
  mediaBuckets:[
    "Images","Image","Visuels","Visuel","Media","Médias","Gallery","Galerie","Carousel",
    "Photos","Photo","Image URL","Image URLs","URLs","URL","Lien","Liens","Video","Vidéos"
  ],
};

const firstProp = (props, names) => {
  for (const n of names) if (props[n]) return props[n];
  return null;
};
const plain = (rich=[]) => rich.map(r => r.plain_text || "").join("").trim();

const isVideo = (u="") => /\.(mp4|mov|webm|m4v|mkv|ogg)(\?|$)/i.test(u);
const isImage = (u="") => /\.(png|jpe?g|webp|gif|avif|svg)(\?|$)/i.test(u);
const extractUrls = (text="") => {
  const out=[]; const re=/https?:\/\/[^\s<>"')]+/gi; let m;
  while ((m=re.exec(text))) out.push(m[0]);
  return out;
};

const allowlistHost = (h="") =>
  /(images\.unsplash\.com|cloudfront|imgur|githubusercontent|googleusercontent|cdn|giphy\.com|gstatic\.com)/i.test(h);

const proxify = (url) => {
  try {
    const u = new URL(url);
    if (allowlistHost(u.hostname) && (isImage(url) || isVideo(url))) return url;
    const isNotionS3 = /amazonaws\.com|secure\.notion-static\.com/i.test(u.host);
    // Canva et pages HTML doivent aussi passer par /api/media (extraction OG)
    return (isNotionS3 || !isImage(url)) ? `/api/media?url=${encodeURIComponent(url)}` : url;
  } catch { return url; }
};

function pushMedia(list, url) {
  if (!url) return;
  const type = isVideo(url) ? "video" : "image";
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
    // supporte une liste séparée par virgules/sauts de ligne
    prop.url.split(/[,\n\r]+/).map(s=>s.trim()).filter(Boolean).forEach(u=>pushMedia(acc,u));
    return acc;
  }
  if (prop.type === "rich_text") {
    // 1) liens cliquables (href)
    for (const t of prop.rich_text || []) if (t.href) pushMedia(acc, t.href);
    // 2) URLs en clair dans le texte
    extractUrls(plain(prop.rich_text)).forEach(u=>pushMedia(acc,u));
    return acc;
  }
  if (prop.type === "title") {
    for (const t of prop.title || []) if (t.href) pushMedia(acc, t.href);
    extractUrls(plain(prop.title)).forEach(u=>pushMedia(acc,u));
    return acc;
  }
  return acc;
}

export async function fetchPosts({ databaseId, pageSize = 100 }) {
  const out = [];
  let cursor;

  do {
    const resp = await notion.databases.query({
      database_id: databaseId,
      page_size: Math.min(100, pageSize),
      start_cursor: cursor,
      // pas de sorts ici — on trie côté front
    });

    for (const page of resp.results || []) {
      const props = page.properties || {};

      const pName = firstProp(props, ALIAS.name) || props["Name"];
      const name  = pName?.type === "title" ? plain(pName.title) : "Untitled";

      const pDesc = firstProp(props, ALIAS.description);
      const description = pDesc?.type === "rich_text" ? plain(pDesc.rich_text) : "";

      const pStatus = firstProp(props, ALIAS.status);
      const status  = pStatus?.type === "select" ? (pStatus.select?.name || "") : "";

      const pDate = firstProp(props, ALIAS.date);
      const date  = pDate?.type === "date" ? (pDate.date?.start || "") : "";

      const pPin = firstProp(props, ALIAS.pinned);
      const pinned = pPin?.type === "checkbox" ? !!pPin.checkbox : false;

      const pPlat = firstProp(props, ALIAS.platforms);
      const platforms =
        pPlat?.type === "multi_select"
          ? (pPlat.multi_select || []).map(x => x.name).filter(Boolean)
          : [];

      const media = [];
      for (const key of ALIAS.mediaBuckets) if (props[key]) collectMediaFromProperty(media, props[key]);
      // fallback éventuel
      if (media.length === 0 && props["Image"]) collectMediaFromProperty(media, props["Image"]);

      // IMPORTANT : ignorer tout post sans média
      if (media.length === 0) continue;

      out.push({ id: page.id, name, description, status, date, pinned, platforms, media });
    }

    cursor = resp.has_more ? resp.next_cursor : undefined;
  } while (cursor);

  return out;
}
