import { asc, eq } from "drizzle-orm";
import { db, places, pool } from "@app/db";
import { haversineMeters } from "@/lib/geo";

interface LatestFix {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export async function GET() {
  const placeRows = await db.select().from(places).orderBy(asc(places.name));

  // Get latest position for each person to find current occupants
  let occupants: LatestFix[] = [];
  try {
    const { rows } = await pool.query<LatestFix>(`
      SELECT p.id, p.name, l.lat, l.lng
      FROM persons p
      JOIN LATERAL (
        SELECT lat, lng FROM locations WHERE person_id = p.id ORDER BY recorded_at DESC LIMIT 1
      ) l ON TRUE
    `);
    occupants = rows;
  } catch (err) {
    console.warn("[api/places] could not query latest fixes for occupants:", err);
  }

  const enriched = placeRows.map((p) => {
    const here = occupants
      .filter((o) => haversineMeters(o.lat, o.lng, p.lat, p.lng) <= p.radiusM)
      .map((o) => ({ id: o.id, name: o.name }));

    return {
      ...p,
      occupants: here,
    };
  });

  return Response.json(enriched);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const lat = typeof body.lat === "number" ? body.lat : Number.parseFloat(body.lat);
    const lng = typeof body.lng === "number" ? body.lng : Number.parseFloat(body.lng);
    const radiusM = Math.max(
      20,
      Math.min(50000, typeof body.radiusM === "number" ? body.radiusM : 100),
    );
    const icon = typeof body.icon === "string" && body.icon.trim() ? body.icon.trim() : "pin";
    const notifyOnEnter = body.notifyOnEnter !== false;
    const notifyOnLeave = body.notifyOnLeave !== false;

    if (!name) {
      return Response.json({ error: "Name is required." }, { status: 400 });
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return Response.json({ error: "Invalid coordinates." }, { status: 400 });
    }

    const [row] = await db
      .insert(places)
      .values({
        name,
        lat,
        lng,
        radiusM,
        icon,
        notifyOnEnter,
        notifyOnLeave,
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

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const id = typeof body.id === "string" ? body.id : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const lat = typeof body.lat === "number" ? body.lat : Number.parseFloat(body.lat);
    const lng = typeof body.lng === "number" ? body.lng : Number.parseFloat(body.lng);
    const radiusM = Math.max(
      20,
      Math.min(50000, typeof body.radiusM === "number" ? body.radiusM : 100),
    );
    const icon = typeof body.icon === "string" && body.icon.trim() ? body.icon.trim() : "pin";
    const notifyOnEnter = body.notifyOnEnter !== false;
    const notifyOnLeave = body.notifyOnLeave !== false;

    if (!id) {
      return Response.json({ error: "Place ID is required." }, { status: 400 });
    }
    if (!name) {
      return Response.json({ error: "Name is required." }, { status: 400 });
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return Response.json({ error: "Invalid coordinates." }, { status: 400 });
    }

    const [row] = await db
      .update(places)
      .set({
        name,
        lat,
        lng,
        radiusM,
        icon,
        notifyOnEnter,
        notifyOnLeave,
      })
      .where(eq(places.id, id))
      .returning();

    if (!row) {
      return Response.json({ error: "Place not found." }, { status: 404 });
    }

    return Response.json(row);
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
    return Response.json({ error: "id parameter is required." }, { status: 400 });
  }

  try {
    const [row] = await db.delete(places).where(eq(places.id, id)).returning();
    if (!row) {
      return Response.json({ error: "Place not found." }, { status: 404 });
    }
    return Response.json({ ok: true, deletedId: id });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
