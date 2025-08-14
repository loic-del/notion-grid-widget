import { Client } from "@notionhq/client";

export default async function handler(req, res) {
  try {
    const notion = new Client({ auth: process.env.NOTION_TOKEN });

    const results = await notion.search({
      filter: { property: "object", value: "database" },
      page_size: 50
    });

    const list = results.results.map(db => ({
      title:
        db.title?.[0]?.plain_text ||
        "(Sans titre)",
      id_plain: db.id.replace(/-/g, ""),
      id_dashed: db.id
    }));

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(200).end(JSON.stringify(list, null, 2));
  } catch (err) {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.status(500).end("ERROR: " + (err?.message || String(err)));
  }
}
