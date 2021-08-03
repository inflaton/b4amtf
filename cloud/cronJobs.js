const commonFunctions = require("./commonFunctions.js");

Parse.Cloud.job("sendVerificationEmail", async function () {
  await commonFunctions.sendVerificationEmail();
});
