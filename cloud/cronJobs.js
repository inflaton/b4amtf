/* eslint-disable no-await-in-loop */
/* eslint-disable no-unused-vars */
const commonFunctions = require("./commonFunctions.js");
const logger = require("parse-server").logger;
const MASTER_KEY = { useMasterKey: true };

Parse.Cloud.job("sendVerificationEmail", async function (request, status) {
  const date = new Date();
  const timeNow = date.getTime();

  logger.info("Job sendVerificationEmail started at " + date);
  try {
    const intervalOfTime = 7 * commonFunctions.DAY_IN_MS; // the time set is 7 days in milliseconds
    const timeThen = timeNow + intervalOfTime;

    const expiredDate = new Date();
    expiredDate.setTime(timeThen);

    const query = new Parse.Query(Parse.User);
    query.equalTo("emailVerified", false);
    const results = await query.find(MASTER_KEY);

    for (let i = 0; i < results.length; i++) {
      const user = results[i];
      if (user.get("createdAt") < expiredDate) {
        const email = user.get("email");
        if (email) {
          let newEmail = email.trim();
          if (newEmail === email) {
            newEmail = email + " ";
          }
          user.set("email", newEmail);
          const parseUser = await user.save(null, MASTER_KEY);
          logger.info(`sent verification email to [${parseUser.get("email")}]`);
        }
      } else {
        user
          .destroy(MASTER_KEY)
          .then(destroyed => {
            logger.info(
              "Successfully destroyed object" + JSON.stringify(destroyed)
            );
          })
          .catch(error => {
            logger.info("Error: " + error.code + " - " + error.message);
          });
      }
    }
  } catch (e) {
    logger.info("Exception: " + JSON.stringify(e));
  }

  logger.info("Job sendVerificationEmail finished at " + new Date());
});
