import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

type ExportFile = {
  uri: string;
  create(options: { overwrite: boolean }): void;
  write(contents: string): void;
  delete(): void;
};

export type DataExportDependencies = {
  createFile: (name: string) => ExportFile;
  isSharingAvailable: () => Promise<boolean>;
  shareFile: (
    uri: string,
    options: { dialogTitle: string; mimeType: string; UTI: string },
  ) => Promise<void>;
};

const defaultDependencies: DataExportDependencies = {
  createFile: (name) => new File(Paths.cache, name),
  isSharingAvailable: Sharing.isAvailableAsync,
  shareFile: Sharing.shareAsync,
};

export async function shareDataExport(
  data: Record<string, unknown>,
  dependencies: DataExportDependencies = defaultDependencies,
) {
  if (!(await dependencies.isSharingAvailable())) {
    throw new Error("data_export_sharing_unavailable");
  }

  const file = dependencies.createFile("openmatch-data.json");
  let created = false;
  try {
    file.create({ overwrite: true });
    created = true;
    file.write(`${JSON.stringify(data, null, 2)}\n`);
    await dependencies.shareFile(file.uri, {
      dialogTitle: "Save or share your WhyMatch data",
      mimeType: "application/json",
      UTI: "public.json",
    });
  } finally {
    if (created) file.delete();
  }
}
