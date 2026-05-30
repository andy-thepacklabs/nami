/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'thepacklabs.com' },
    ],
  },
}

module.exports = nextConfig
