import { Client } from "@notionhq/client";

export default async function handler(req, res) {
  try {
    const notion = new Client({ auth: process.env.NOTION_TOKEN });
    const dbId = process.env.NOTION_DATABASE_ID;
    const info = await notion.databases.retrieve({ database_id: dbId });
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(200).end(JSON.stringify({ ok: true, title: info.title?.[0]?.plain_text || null }));
  } catch (err) {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.status(500).end("ERROR: " + (err?.message || String(err)));
  }
}
