import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(process.env.NEXT_OUTPUT_STANDALONE === "1" ? { output: "standalone" } : {}),
  transpilePackages: ["@app/db", "@app/gmaps-client"],
  serverExternalPackages: ["pg"],
};

export default nextConfig;
