function setupParseServer(app, nodeEnv, includingDashboard = false) {
  const ParseServer = require('parse-server').ParseServer;
  const ParseDashboard = require('parse-dashboard');
  const databaseUri = process.env.DATABASE_URI || process.env.MONGODB_URI;

  if (!databaseUri) {
    console.log('DATABASE_URI not specified, falling back to localhost.');
  }

  console.log(`process.env.LOG_LEVEL: ${process.env.LOG_LEVEL}`);
  const emailAdapter = require('./emailAdapter.cjs');
  const config = {
    logLevel: process.env.LOG_LEVEL || "info",
    databaseURI: databaseUri || 'mongodb://localhost:27017/dev',
    cloud: __dirname + '/../cloud/main.cjs',
    appId: process.env.VUE_APP_PARSE_APP_ID || 'NRXUJ7VoDl3pho3QihRUnN6JoRdAOPiLnV5A0vifIwE',
    masterKey: process.env.PARSE_MASTER_KEY || 'wVuwX7XYH0E2X9fmMXoxyigZI3eEzJDnAGG3B8AI4lA',
    javascriptKey: process.env.VUE_APP_PARSE_JS_KEY || '1EmGj7cdldzyzoYEWTiaeoWwMt5q7dOXWsK4r1Q03ic',
    serverURL: process.env.SERVER_URL || 'http://localhost:1337/parse',
    liveQuery: {
      classNames: ['Class', 'ClassSession'], // List of classes to support for query subscriptions
    },

    // Enable email verification
    verifyUserEmails: true,

    // Set email verification token validity to 2 hours
    emailVerifyTokenValidityDuration: 2 * 60 * 60,
    preventLoginWithUnverifiedEmail: true,
    publicServerURL: process.env.PUBLIC_SERVER_URL || 'http://localhost:8080/parse',
    appName: 'Amitabha 香光庄严',

    // Set email adapter
    emailAdapter
  };

  console.log(`config: ${JSON.stringify(config)}`);

  // Serve the Parse API on the /parse URL prefix
  const mountPath = process.env.PARSE_MOUNT || '/parse';
  const api = new ParseServer(config);
  app.use(mountPath, api);

  if (includingDashboard) {
    const options = { allowInsecureHTTP: true };

    const dashboard = new ParseDashboard({
      "apps": [
        {
          "serverURL": config.serverURL,
          "appId": config.appId,
          "masterKey": config.masterKey,
          "appName": config.appName
        }
      ]
    }, options);

    // make the Parse Dashboard available at /dashboard
    app.use('/dashboard', dashboard);
  }
}

module.exports = setupParseServer;
