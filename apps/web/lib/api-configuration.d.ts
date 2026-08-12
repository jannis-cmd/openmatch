export type WebApiConfiguration =
  { url: string; error: null } | { url: null; error: string };

export function resolveWebApiConfiguration(
  configuredUrl: string | undefined,
  development: boolean,
): WebApiConfiguration;
