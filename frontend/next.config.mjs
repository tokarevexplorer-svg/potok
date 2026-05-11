/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      // Сессия 3: переименование подразделов Команды. 301, чтобы внешние
      // ссылки и закладки не ломались.
      {
        source: "/blog/team/tools",
        destination: "/blog/team/dashboard",
        permanent: true,
      },
      {
        source: "/blog/team/database",
        destination: "/blog/team/artifacts",
        permanent: true,
      },
      {
        source: "/blog/team/prompts",
        destination: "/blog/team/instructions",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
