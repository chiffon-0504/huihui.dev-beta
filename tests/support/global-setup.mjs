import { startStaticServer } from "./static-server.mjs";

export default async function globalSetup() {
  const server = await startStaticServer();

  return async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  };
}
