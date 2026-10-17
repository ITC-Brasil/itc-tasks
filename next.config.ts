import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  // o indicador do dev cobre o menu da conta no canto da sidebar (e os cliques do E2E)
  devIndicators: false,
};

export default nextConfig;
