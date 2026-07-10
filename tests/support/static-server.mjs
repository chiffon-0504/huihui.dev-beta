import { createReadStream } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

const root = path.resolve(process.cwd());
const port = Number(process.env.PORT || 4173);

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".webp", "image/webp"],
]);

function resolveRequestPath(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, "http://localhost").pathname);
  const relativePath = pathname.endsWith("/")
    ? `${pathname.slice(1)}index.html`
    : pathname.slice(1);
  const resolvedPath = path.resolve(root, relativePath || "index.html");

  if (resolvedPath !== root && !resolvedPath.startsWith(`${root}${path.sep}`)) {
    return null;
  }

  return resolvedPath;
}

async function sendFile(response, filePath, statusCode = 200) {
  const fileStats = await stat(filePath);
  response.writeHead(statusCode, {
    "Content-Length": fileStats.size,
    "Content-Type": contentTypes.get(path.extname(filePath)) || "application/octet-stream",
  });
  createReadStream(filePath).pipe(response);
}

async function handleRequest(request, response) {
  try {
    const filePath = resolveRequestPath(request.url || "/");

    if (!filePath) {
      response.writeHead(400).end("Bad Request");
      return;
    }

    await access(filePath);
    await sendFile(response, filePath);
  } catch {
    try {
      const body = await readFile(path.join(root, "404.html"));
      response.writeHead(404, {
        "Content-Length": body.length,
        "Content-Type": "text/html; charset=utf-8",
      });
      response.end(body);
    } catch {
      response.writeHead(404).end("Not Found");
    }
  }
}

export function startStaticServer() {
  return new Promise((resolve, reject) => {
    const server = createServer(handleRequest);

    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server);
    });
  });
}
