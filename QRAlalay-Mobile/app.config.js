const app = require('./app.json').expo;

// Keep Firebase's public Android client config out of Git. EAS can provide it
// as a secret file environment variable for cloud builds.
module.exports = {
  ...app,
  android: {
    ...app.android,
    ...(process.env.GOOGLE_SERVICES_JSON
      ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON }
      : {}),
  },
};
