// It is best practise to organize your cloud functions group into their own file. You can then import them in your main.js.
require("./cronJobs.cjs");
require("./dataFunctions.cjs");
require("./adminFunctions.cjs");
require("./cloudFunctionsV1.cjs");
require("./cloudFunctionsV2.cjs");
