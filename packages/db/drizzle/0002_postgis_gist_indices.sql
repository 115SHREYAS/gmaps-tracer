CREATE EXTENSION IF NOT EXISTS postgis;
CREATE INDEX IF NOT EXISTS "locations_geom_gist" ON "locations" USING GIST (ST_SetSRID(ST_MakePoint("lng", "lat"), 4326));
