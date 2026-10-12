import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse ships pdf.js and a prebuilt native canvas binding. Bundling those
  // rewrites the worker path and drops the .node binary, so /api/parse-resume
  // fails at runtime — leave the package to Node's own require.
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
