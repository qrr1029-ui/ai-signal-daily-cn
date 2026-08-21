import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  // vinext 1.0.0-beta.2 treats its own trailing-slash 308 as a static-export
  // error for nested routes. Extensionful output is also unambiguous on Pages.
  trailingSlash: false,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
