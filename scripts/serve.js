import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extname, resolve, relative, isAbsolute } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
};
const port = Number(process.env.PORT || 4173);
createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(
      new URL(request.url, "http://localhost").pathname,
    );
    const file = resolve(
      root,
      `.${pathname === "/" ? "/index.html" : pathname}`,
    );
    const local = relative(root, file);
    if (
      isAbsolute(local) ||
      local.startsWith("..") ||
      local
        .split(/[\\/]/)
        .some((part) => part.startsWith(".") || part === "node_modules")
    ) {
      response.writeHead(403).end();
      return;
    }
    const data = await readFile(file);
    response
      .writeHead(200, {
        "Content-Type": `${types[extname(file)] || "application/octet-stream"}; charset=utf-8`,
        "Cache-Control": "no-store",
      })
      .end(data);
  } catch {
    response.writeHead(404).end("Not found");
  }
}).listen(port, "127.0.0.1", () =>
  console.log(`Local: http://127.0.0.1:${port}`),
);
