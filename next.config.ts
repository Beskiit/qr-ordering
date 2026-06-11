import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the dev server to serve HMR / dev resources to your phone on the LAN.
  allowedDevOrigins: ["192.168.100.7"],
};

export default nextConfig;
