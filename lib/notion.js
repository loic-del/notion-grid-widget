import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_TOKEN });

export async function fetchPosts({
  databaseId,
  pageSize = 60,
}) {
  const resp = await notion.databases.query({
    database_id: databaseId,
    page_size: pageSize,
    sorts: [
      { property: "Pinned", direction: "descending" },
      { property: "Date", direction: "descending" }
    ]
  });

  const items = [];
  for (const page of resp.results) {
    const props = page.properties || {};

    const name = props.Name?.title?.[0]?.plain_text ?? "Untitled";

    let imageUrl = null;
    if (props.Image?.type === "files" && Array.isArray(props.Image.files) && props.Image.files.length) {
      const f = props.Image.files[0];
      imageUrl = f.type === "external" ? f.external.url : f.file.url;
    } else if (props.Image?.type === "url" && props.Image.url) {
      imageUrl = props.Image.url;
    } else if (props.Image?.type === "rich_text" && props.Image.rich_text?.[0]?.href) {
      imageUrl = props.Image.rich_text[0].href;
    } else if (props.Image?.type === "rich_text" && props.Image.rich_text?.[0]?.plain_text) {
      imageUrl = props.Image.rich_text[0].plain_text;
    }

    const status = props.Status?.select?.name ?? null;
    const pinned = props.Pinned?.checkbox ?? false;
    const date = props.Date?.date?.start ?? null;

    if (imageUrl) {
      items.push({ id: page.id, name, imageUrl, status, pinned, date });
    }
  }

  return items;
}
