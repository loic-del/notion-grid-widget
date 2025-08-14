import { Client } from "@notionhq/client";
const notion = new Client({ auth: process.env.NOTION_TOKEN });

// util: choisir la première propriété existante
function pick(props, names) { for (const n of names) if (props[n]) return props[n]; return null; }

export async function fetchPosts({ databaseId, pageSize = 60 }) {
  const resp = await notion.databases.query({
    database_id: databaseId,
    page_size: pageSize,
    // triera si les propriétés existent; si elles n'existent pas, Notion renvoie une erreur,
    // donc on ne met que des champs présents par défaut (Pinned/Date)
    sorts: [
      { property: "Pinned", direction: "descending" },
      { property: "Date", direction: "descending" }
    ]
  });

  const items = [];
  for (const page of resp.results || []) {
    const props = page.properties || {};

    // Title
    const pTitle = pick(props, ["Name", "Titre du post", "Titre"]);
    const name = pTitle?.title?.[0]?.plain_text ?? "Untitled";

    // Image (Files & media ou URL/rich_text)
    let imageUrl = null;
    const pImg = pick(props, ["Image", "Visuel", "Image URL"]);
    if (pImg?.type === "files" && Array.isArray(pImg.files) && pImg.files.length) {
      const f = pImg.files[0];
      imageUrl = f.type === "external" ? f.external.url : f.file.url;
    } else if (pImg?.type === "url" && pImg.url) {
      imageUrl = pImg.url;
    } else if (pImg?.type === "rich_text" && pImg.rich_text?.[0]?.href) {
      imageUrl = pImg.rich_text[0].href;
    } else if (pImg?.type === "rich_text" && pImg.rich_text?.[0]?.plain_text) {
      imageUrl = pImg.rich_text[0].plain_text;
    }

    // Status / Statut
    const pStatus = pick(props, ["Status", "Statut"]);
    const status = pStatus?.select?.name ?? null;

    // Pinned / Épingler
    const pPin = pick(props, ["Pinned", "Épingler", "Epingler"]);
    const pinned = pPin?.checkbox ?? false;

    // Date
    const pDate = pick(props, ["Date"]);
    const date = pDate?.date?.start ?? null;

    if (imageUrl) items.push({ id: page.id, name, imageUrl, status, pinned, date });
  }

  // Pinned d’abord, puis date desc si dispo
  items.sort((a, b) => {
    if (a.pinned !== b.pinned) return Number(b.pinned) - Number(a.pinned);
    if (a.date && b.date) return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0);
    return 0;
  });

  return items;
}
