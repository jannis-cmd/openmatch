import {
  shareDataExport,
  type DataExportDependencies,
} from "../lib/share-data-export";

const setup = (available = true, shareError?: Error) => {
  const events: string[] = [];
  const dependencies: DataExportDependencies = {
    createFile: (name) => ({
      uri: `file:///private-cache/${name}`,
      create: ({ overwrite }) => events.push(`create:${overwrite}`),
      write: (contents) => events.push(`write:${contents}`),
      delete: () => events.push("delete"),
    }),
    isSharingAvailable: async () => available,
    shareFile: async (uri, options) => {
      events.push(`share:${uri}:${options.mimeType}:${options.UTI}`);
      if (shareError) throw shareError;
    },
  };
  return { dependencies, events };
};

test("shares a formatted JSON file and removes the private cache copy", async () => {
  const { dependencies, events } = setup();
  await shareDataExport(
    { schemaVersion: "1.0.0", profile: { name: "Taylor" } },
    dependencies,
  );
  expect(events).toEqual([
    "create:true",
    expect.stringContaining('write:{\n  "schemaVersion": "1.0.0"'),
    "share:file:///private-cache/openmatch-data.json:application/json:public.json",
    "delete",
  ]);
});

test("removes the cache copy when the system share sheet fails", async () => {
  const { dependencies, events } = setup(true, new Error("share failed"));
  await expect(shareDataExport({ profile: {} }, dependencies)).rejects.toThrow(
    "share failed",
  );
  expect(events.at(-1)).toBe("delete");
});

test("does not create a file when system sharing is unavailable", async () => {
  const { dependencies, events } = setup(false);
  await expect(shareDataExport({}, dependencies)).rejects.toThrow(
    "data_export_sharing_unavailable",
  );
  expect(events).toEqual([]);
});
