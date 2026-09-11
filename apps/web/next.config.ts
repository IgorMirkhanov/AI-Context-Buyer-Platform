import path from "path";
import type { NextConfig } from "next";

const monorepoRoot = path.join(__dirname, "../..");
const onVercel = Boolean(process.env.VERCEL);

const nextConfig: NextConfig = {
  // Standalone is for Docker/GHCR; Vercel uses its own Next builder.
  ...(onVercel ? {} : { output: "standalone" as const }),
  outputFileTracingRoot: monorepoRoot,
  turbopack: {
    root: monorepoRoot,
  },
};

export default nextConfig;
