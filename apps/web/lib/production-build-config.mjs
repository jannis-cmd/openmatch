import { readdir, readFile } from "node:fs/promises";

const plainHttpsOrigin = (value) => {
  const parsed = new URL(value);
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  )
    throw new Error("expected_api_origin_must_be_plain_https");
  return parsed.origin;
};

const javascriptFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) return javascriptFiles(path);
      return entry.isFile() && entry.name.endsWith(".js") ? [path] : [];
    }),
  );
  return nested.flat();
};

export async function verifyInteractiveProductionBuild(
  clientChunksDirectory,
  expectedApiOrigin,
) {
  const expected = plainHttpsOrigin(expectedApiOrigin);
  const files = await javascriptFiles(clientChunksDirectory);
  if (files.length === 0) throw new Error("production_client_bundle_missing");
  for (const file of files) {
    if ((await readFile(file, "utf8")).includes(expected)) return expected;
  }
  throw new Error("expected_api_origin_missing_from_client_bundle");
}
