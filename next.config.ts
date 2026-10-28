import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// T040 (FR-411): next-intl App Router wiring — request config lives in
// lib/i18n/request.ts (resolveLocale chain, T012).
const withNextIntl = createNextIntlPlugin("./lib/i18n/request.ts");

const nextConfig: NextConfig = {
  /* config options here */
};

export default withNextIntl(nextConfig);
