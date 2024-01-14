// Example express application adding the parse-server module to expose Parse
// compatible API routes.

import express from "express";
import dotEnv from "dotenv-flow";
import compression from "compression";
import cors from "cors";

import setupParseServer from "./lib/setupParseServer.cjs";
import { installProxyMiddlewares } from "amtf-proxy";

const NODE_ENV_DEV = "development";
const nodeEnv = process.env.NODE_ENV || NODE_ENV_DEV;
console.log(`nodeEnv: ${nodeEnv}`);
process.env.NODE_ENV = nodeEnv;
dotEnv.config();

const app = express();
app.use(cors());

// Compress all HTTP responses
app.use(compression());

await setupParseServer(app, nodeEnv);

app.use('/baoyan', express.static('baoyan'))

const pathnameList = ["/online"];
installProxyMiddlewares(app, pathnameList);

const port = process.env.PORT || 1337;
app.listen(port, function () {
  console.log(`${new Date()} - app is listening on port: ${port}`);
});
