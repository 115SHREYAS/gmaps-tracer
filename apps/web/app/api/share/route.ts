import crypto from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db, persons, shareTokens } from "@app/db";

export async function GET() {
  const tokens = await db
    .select({
      id: shareTokens.id,
      token: shareTokens.token,
      personId: shareTokens.personId,
      personName: persons.name,
      label: shareTokens.label,
      expiresAt: shareTokens.expiresAt,
      createdAt: shareTokens.createdAt,
    })
    .from(shareTokens)
    .innerJoin(persons, eq(persons.id, shareTokens.personId))
    .orderBy(desc(shareTokens.createdAt));

  const now = Date.now();
  const enriched = tokens.map((t) => ({
    ...t,
    isExpired: t.expiresAt ? t.expiresAt.getTime() < now : false,
  }));

  return Response.json(enriched);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const personId = typeof body.personId === "string" ? body.personId.trim() : "";
    const label = typeof body.label === "string" ? body.label.trim() : "";
    const durationHours = typeof body.durationHours === "number" ? body.durationHours : null;

    if (!personId) {
      return Response.json({ error: "personId is required" }, { status: 400 });
    }

    const token = crypto.randomBytes(16).toString("hex");

    let expiresAt: Date | null = null;
    if (durationHours && durationHours > 0) {
      expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000);
    }

    const [row] = await db
      .insert(shareTokens)
      .values({
        token,
        personId,
        label: label || null,
        expiresAt,
      })
      .returning();

    return Response.json(row, { status: 201 });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return Response.json({ error: "id parameter is required" }, { status: 400 });
  }

  try {
    const [row] = await db.delete(shareTokens).where(eq(shareTokens.id, id)).returning();
    if (!row) {
      return Response.json({ error: "Share token not found" }, { status: 404 });
    }
    return Response.json({ ok: true, deletedId: id });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
