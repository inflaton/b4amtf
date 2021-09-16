// Example express application adding the parse-server module to expose Parse
// compatible API routes.

import express from 'express';
import setupParseServer from './lib/setupParseServer.cjs';
import { installProxyMiddlewares } from "amtf-proxy";

const app = express();
setupParseServer(app);
installProxyMiddlewares(app);

const port = process.env.PORT || 1337;
app.listen(port, function () {
  console.log('parse-server running on port ' + port + '.');
});
