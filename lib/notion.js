import { Client } from "@notionhq/client";
const notion = new Client({ auth: process.env.NOTION_TOKEN });

// util: renvoie la 1re propriété existante parmi une liste
function pick(props, names) { for (const n of names) if (props[n]) return props[n]; return null; }

export async function fetchPosts({ databaseId, pageSize = 60, platforms = null }) {
  // filtre optionnel par plateformes (multi-select)
  const filter =
    Array.isArray(platforms) && platforms.length
      ? {
          property: "Social",
          multi_select: { contains: platforms[0] } // on affinera côté client (voir note)
        }
      : undefined;

  const resp = await notion.databases.query({
    database_id: databaseId,
    page_size: pageSize,
    filter,
    sorts: [
      { property: "Pinned", direction: "descending" },
      { property: "Date", direction: "descending" }
    ]
  });

  const items = [];
  for (const page of resp.results || []) {
    const props = page.properties || {};

    // Titre
    const pTitle = pick(props, ["Name", "Titre du post", "Titre"]);
    const name = pTitle?.title?.[0]?.plain_text ?? "Untitled";

    // Description (Rich text)
    const pDesc = pick(props, ["Description", "Caption", "Texte"]);
    const description =
      pDesc?.type === "rich_text"
        ? (pDesc.rich_text || []).map(t => t.plain_text || "").join("")
        : (pDesc?.[pDesc?.type] ?? "") || "";

    // Image (Files & media ou URL)
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

    // Status
    const pStatus = pick(props, ["Status", "Statut"]);
    const status = pStatus?.select?.name ?? null;

    // Pinned
    const pPin = pick(props, ["Pinned", "Épingler", "Epingler"]);
    const pinned = pPin?.checkbox ?? false;

    // Date
    const pDate = pick(props, ["Date"]);
    const date = pDate?.date?.start ?? null;

    // Social (multi-select)
    const pSocial = props.Social;
    const platformsArr = Array.isArray(pSocial?.multi_select)
      ? pSocial.multi_select.map(s => s.name)
      : [];

    if (imageUrl) {
      items.push({ id: page.id, name, description, imageUrl, status, pinned, date, platforms: platformsArr });
    }
  }

  // Tri final (pinned puis date)
  items.sort((a, b) => {
    if (a.pinned !== b.pinned) return Number(b.pinned) - Number(a.pinned);
    if (a.date && b.date) return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0);
    return 0;
  });

  return items;
}
