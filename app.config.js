const appConfig = require('./app.json').expo;
const downloadToken = process.env.RNMAPBOX_MAPS_DOWNLOAD_TOKEN;

module.exports = {
  ...appConfig,
  plugins: [
    ...(appConfig.plugins ?? []),
    [
      '@rnmapbox/maps',
      {
        RNMapboxMapsVersion: '11.6.0',
        ...(downloadToken ? { RNMapboxMapsDownloadToken: downloadToken } : {}),
      },
    ],
  ],
};
