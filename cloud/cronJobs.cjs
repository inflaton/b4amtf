const commonFunctions = require("./commonFunctions.cjs");

Parse.Cloud.job("sendVerificationEmail", async function () {
  await commonFunctions.sendVerificationEmail();
});
