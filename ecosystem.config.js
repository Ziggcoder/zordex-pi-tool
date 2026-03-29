module.exports = {
  apps: [
    {
      name: "zordex-pi-tool",
      cwd: "/home/zigg/zigg/server",
      script: "server.js",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        STATIC_DIR: "/home/zigg/zigg/client/dist"
      }
    }
  ]
};
