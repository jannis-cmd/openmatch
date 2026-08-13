export default ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    sourceRevision: process.env.EAS_BUILD_GIT_COMMIT_HASH ?? null,
  },
});
