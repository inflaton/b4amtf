// Example express application adding the parse-server module to expose Parse
// compatible API routes.

const express = require('express');
const ParseServer = require('parse-server').ParseServer;
const ParseDashboard = require('parse-dashboard');
const path = require('path');
const args = process.argv || [];
const test = args.some(arg => arg.includes('jasmine'));

const databaseUri = process.env.DATABASE_URI || process.env.MONGODB_URI;

if (!databaseUri) {
  console.log('DATABASE_URI not specified, falling back to localhost.');
}

const config = {
  databaseURI: databaseUri || 'mongodb://localhost:27017/dev',
  // logLevel: "verbose",
  logLevel: "info",
  cloud: process.env.CLOUD_CODE_MAIN || __dirname + '/cloud/main.js',
  appId: process.env.APP_ID || 'LL9oIdzIkmwl5xyowQQu0fTmXyUWfet9RuAzwHfj',
  masterKey: process.env.MASTER_KEY || 'R3S8PYQKuzeV4c8MUeO5ved46C50MEp56boDHW1O', //Add your master key here. Keep it secret!
  serverURL: process.env.SERVER_URL || 'http://localhost:1337/parse', // Don't forget to change to https if needed
  publicServerURL: process.env.PUBLIC_SERVER_URL || 'http://localhost:1337/parse',
  liveQuery: {
    classNames: ['Posts', 'Comments'], // List of classes to support for query subscriptions
  },
};
// Client-keys like the javascript key or the .NET key are not necessary with parse-server
// If you wish you require them, you can set them as options in the initialization above:
// javascriptKey, restAPIKey, dotNetKey, clientKey

const app = express();

// Serve static assets from the /public folder
app.use('/public', express.static(path.join(__dirname, '/public')));


// Parse Server plays nicely with the rest of your web routes
app.get('/', function (req, res) {
  res.status(200).send('I dream of being a website.  Please star the parse-server repo on GitHub!');
});

// There will be a test page available on the /test path of your server url
// Remove this before launching your app
app.get('/test', function (req, res) {
  res.sendFile(path.join(__dirname, '/public/test.html'));
});

// Serve the Parse API on the /parse URL prefix
const mountPath = process.env.PARSE_MOUNT || '/parse';
const port = process.env.PORT || 1337;
if (!test) {
  const api = new ParseServer(config);
  app.use(mountPath, api);

  const options = { allowInsecureHTTP: true };

  const dashboard = new ParseDashboard({
    "apps": [
      {
        "serverURL": config.serverURL,
        "appId": config.appId,
        "masterKey": config.masterKey,
        "appName": "Amituofo"
      }
    ]
  }, options);

  // make the Parse Dashboard available at /dashboard
  app.use('/dashboard', dashboard);

  app.listen(port, function () {
    console.log('parse-server running on port ' + port + '.');
  });
}

module.exports = {
  app,
  config,
};
