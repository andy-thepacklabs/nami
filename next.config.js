/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'thepacklabs.com' },
    ],
  },
  devIndicators: false,
}

module.exports = nextConfig
