/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'thepacklabs.com' },
    ],
  },
  allowedDevHosts: [
    '.ngrok-free.app',
    '.ngrok.io',
  ],
}

module.exports = nextConfig
