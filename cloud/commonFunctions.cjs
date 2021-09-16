/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */
const MASTER_KEY = { useMasterKey: true };
const MAX_QUERY_COUNT = 3000;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const logger = require("parse-server").logger;
const axios = require('axios');

const requireAuth = user => {
  if (!user) throw new Error("User must be authenticated!");
  // Parse.Cloud.useMasterKey();
};

const requireRole = (userWithRoles, role) => {
  if (!userWithRoles) throw new Error("User must be authenticated!");
  if (!userWithRoles.roles.includes(role)) {
    throw new Error(`User must be ${role}!`);
  }
};

const reportPracticeCountV2 = async function (
  user,
  practiceId,
  reportedAt,
  count,
  practiceSessions
) {
  requireAuth(user);

  const userId = user.id;
  logger.info(
    `reportPracticeCountV2 - userId: ${userId} practiceId: ${practiceId} reportedAt: ${reportedAt} count: ${count} practiceSessions: ${JSON.stringify(
      practiceSessions
    )}`
  );

  var query = new Parse.Query("Practice");
  query.equalTo("objectId", practiceId);
  const practice = await query.first();
  var relation = practice.relation("counts");
  var newCount = false;
  var delta = count == undefined ? 0 : count;

  query = relation.query();
  query.equalTo("userId", userId);
  query.equalTo("reportedAt", reportedAt);
  var currentPracticeCount = await query.first();

  if (currentPracticeCount) {
    delta -= currentPracticeCount.get("count");
    if (count == undefined) {
      await currentPracticeCount.destroy();
      currentPracticeCount = undefined;
    }
  } else {
    if (count != undefined) {
      currentPracticeCount = new Parse.Object("UserPracticeCount");
      currentPracticeCount.set("userId", userId);
      currentPracticeCount.set("reportedAt", reportedAt);
      newCount = true;
    }
  }

  if (currentPracticeCount) {
    currentPracticeCount.set("count", count);
    currentPracticeCount = await currentPracticeCount.save(null, MASTER_KEY);
  }

  query = relation.query();
  query.equalTo("userId", userId);
  query.equalTo("reportedAt", undefined);
  var accumulatedCount = await query.first();

  if (accumulatedCount) {
    count = accumulatedCount.get("count") + delta;
  } else {
    accumulatedCount = new Parse.Object("UserPracticeCount");
    accumulatedCount.set("userId", userId);
    accumulatedCount.set("reportedAt", undefined);
    newCount = true;
  }

  accumulatedCount.set("count", count);
  accumulatedCount = await accumulatedCount.save(null, MASTER_KEY);

  if (newCount) {
    if (currentPracticeCount) {
      relation.add(currentPracticeCount);
    }

    relation.add(accumulatedCount);
    await practice.save(null, MASTER_KEY);
  }

  var resultPracticeSessions = [];
  if (currentPracticeCount && practiceSessions) {
    relation = currentPracticeCount.relation("practiceSessions");
    query = relation.query();
    query.ascending("index");
    var parsePracticeSessions = await query.limit(MAX_QUERY_COUNT).find();

    const length =
      parsePracticeSessions.length > practiceSessions.length
        ? parsePracticeSessions.length
        : practiceSessions.length;
    for (var i = 0; i < length; i++) {
      var parsePracticeSession = undefined;
      if (i < parsePracticeSessions.length) {
        parsePracticeSession = parsePracticeSessions[i];
      } else {
        parsePracticeSession = new Parse.Object("UserPracticeSession");
      }
      resultPracticeSessions.push(parsePracticeSession);

      if (i < practiceSessions.length) {
        parsePracticeSession.set("index", i + 1);
        parsePracticeSession.set(
          "submoduleId",
          practiceSessions[i].submoduleId
        );
        parsePracticeSession.set("duration", practiceSessions[i].duration);
        parsePracticeSession = await parsePracticeSession.save(
          null,
          MASTER_KEY
        );

        if (i >= parsePracticeSessions.length) {
          relation.add(parsePracticeSession);
        }
      } else {
        relation.remove(parsePracticeSession);
        await parsePracticeSession.destroy();
      }
    }
    currentPracticeCount = await currentPracticeCount.save(null, MASTER_KEY);
  }

  relation = practice.relation("counts");
  query = relation.query();
  query.equalTo("userId", userId);
  query.descending("reportedAt");
  currentPracticeCount = await query.first();

  return {
    id: currentPracticeCount._getId(),
    count: currentPracticeCount.get("count"),
    reportedAt: currentPracticeCount.get("reportedAt"),
    accumulatedCount: accumulatedCount.get("count"),
    sessions: resultPracticeSessions ? resultPracticeSessions.length : 0
  };
};

const updateAttendanceV2 = async function (
  user,
  classId,
  sessionId,
  attendance
) {
  requireAuth(user);

  var count = attendance.attendance ? 1 : 0;
  const result = {};
  var query = new Parse.Query("UserSessionAttendance");
  query.equalTo("userId", user.id);
  query.equalTo("sessionId", sessionId);
  var sessionAttendance = await query.first();

  if (!sessionAttendance) {
    sessionAttendance = new Parse.Object("UserSessionAttendance");
    sessionAttendance.set("userId", user.id);
    sessionAttendance.set("sessionId", sessionId);
  } else {
    if (sessionAttendance.get("attendance")) {
      count -= 1;
    }
  }

  sessionAttendance.set("attendance", attendance.attendance);
  sessionAttendance.set("onLeave", attendance.onLeave);

  sessionAttendance = await sessionAttendance.save(null, MASTER_KEY);

  result.attendance = sessionAttendance.get("attendance");
  result.onLeave = sessionAttendance.get("onLeave");

  query = new Parse.Query("UserActivityStats");
  var key = {
    userId: user.id,
    classId
  };
  key = JSON.stringify(key);
  query.equalTo("key", key);
  var stats = await query.first();
  if (stats) {
    count += stats.get("count");
  } else {
    stats = new Parse.Object("UserActivityStats");
    stats.set("key", key);
  }
  stats.set("count", count);
  result.stats = await stats.save(null, MASTER_KEY);

  return result;
};

const getDatesFromCsvHeader = function (csvHeader, isRxl, isPractice) {
  var key,
    year,
    yearStr,
    mapDates = {};
  for (var i = 0; i < csvHeader.length; i++) {
    key = csvHeader[i];
    if (key.startsWith("20") && key.endsWith("TOTAL")) {
      yearStr = key.substring(0, 4);
      year = parseInt(yearStr);
      break;
    }
  }

  for (i = 0; i < csvHeader.length; i++) {
    key = csvHeader[i];
    if (key.startsWith(yearStr) && key.endsWith("TOTAL")) {
      year += 1;
      yearStr = year.toString();
      continue;
    }
    const start = key.indexOf("-");
    if (start > 0) {
      var value = key;
      if (key.length - start > 4) {
        //this must be a range for a week - taking last date
        value = key.substring(start + 1);
      }
      const date = new Date(`${value} ${year}`);
      if (!isPractice) {
        // RXL starts at 9am SGT while DYM at 2pm SGT
        date.setHours(isRxl == undefined ? 0 : isRxl ? 1 : 6);
      }
      mapDates[key] = date;
    }
  }
  return mapDates;
};

const prepareStudyReportGeneration = async function (parseClass, formalStudy) {
  var query = parseClass
    .relation(formalStudy ? "sessions" : "selfStudySessions")
    .query();
  query.ascending("scheduledAt");
  const parseSessions = await query.limit(MAX_QUERY_COUNT).find();
  const csvHeader = ["组别", "组员"];
  const mapDates = {};
  for (var i = 0; i < parseSessions.length; i++) {
    const parseSession = parseSessions[i];
    const scheduledAt = parseSession.get("scheduledAt");
    if (formalStudy) {
      const content = parseSession.get("content");
      for (var j = 0; j < content.submodules.length; j++) {
        const submoduleId = content.submodules[j];
        query = new Parse.Query("Submodule");
        query.equalTo("objectId", submoduleId);
        const parseSubmodule = await query.first();

        if (parseSubmodule) {
          const name = parseSubmodule.get("name");
          const text = `${name}<br>法本`;
          csvHeader.push(text);
          mapDates[text] = scheduledAt;
          const lineage = `${name}<br>传承`;
          csvHeader.push(lineage);
          mapDates[lineage] = scheduledAt;
        }
      }
    } else {
      const name = parseSession.get("name");
      const text = `${name}<br>法本`;
      csvHeader.push(text);
      mapDates[text] = scheduledAt;
      const lineage = `${name}<br>传承`;
      csvHeader.push(lineage);
      mapDates[lineage] = scheduledAt;
    }
  }
  return { csvHeader, mapDates };
};

const prepareReportGeneration = async function (
  parseClass,
  isPractice,
  selfStudy,
  formalStudy
) {
  if (selfStudy || formalStudy) {
    return await prepareStudyReportGeneration(parseClass, formalStudy);
  }

  const csvHeader = ["组别", "组员"];

  const startDate = parseClass.get("startDate");
  const classDay = startDate.getDay();
  var saturday = startDate;
  var sunday = new Date(startDate.getTime() + (7 - classDay) * DAY_IN_MS);

  var today = new Date();
  var endDate = new Date(today.getFullYear(), 11, 31);

  logger.info(
    `prepareReportGeneration - startDate: ${startDate}  sunday: ${sunday} endDate: ${endDate}`
  );

  var lastMonth, lastYear;
  while (saturday <= endDate) {
    var monday = new Date(sunday.getTime() - 6 * DAY_IN_MS);

    const re = /[\s,]+/;
    const monElements = toLocalDateString(monday).split(re);
    const satElements = toLocalDateString(saturday).split(re);
    const sunElements = toLocalDateString(sunday).split(re);
    const newCsvHeader = isPractice
      ? `${monElements[1]}${monElements[0] != sunElements[0] ? monElements[0].toUpperCase() : ""
      }-${sunElements[1]}${sunElements[0].toUpperCase()}`
      : `${satElements[1]}-${satElements[0].toUpperCase()}`;

    if (!lastMonth) {
      lastMonth = satElements[0];
      lastYear = satElements[2];
    } else {
      if (lastMonth != satElements[0]) {
        csvHeader.push(`${lastMonth.toUpperCase()}${lastYear} TOTAL`);
        lastMonth = satElements[0];

        if (lastYear != satElements[2]) {
          csvHeader.push(`${lastYear} TOTAL`);
          lastYear = satElements[2];
        }
      }
    }

    csvHeader.push(newCsvHeader);

    sunday = new Date(sunday.getTime() + 7 * DAY_IN_MS);
    saturday = new Date(sunday.getTime() - (7 - classDay) * DAY_IN_MS);
  }

  csvHeader.push(`${lastMonth.toUpperCase()}${lastYear} TOTAL`);
  csvHeader.push(`${lastYear} TOTAL`);
  csvHeader.push("TOTAL");

  var mapDates = getDatesFromCsvHeader(csvHeader, undefined, isPractice);

  return { csvHeader, mapDates };
};

const formatCount = function (count) {
  if (count != undefined) {
    return count.toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1,");
  }
  return "";
};

const formatMinutes = function (minutes) {
  if (minutes != undefined) {
    minutes = (minutes / 60).toFixed(2);
    return minutes.replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1,");
  }
  return "";
};

const toLocalDateString = function (date) {
  const options = {
    year: "numeric",
    month: "short",
    day: "numeric"
  };
  return date.toLocaleDateString("en-UK", options);
};

const sendEmailViaSendGrid = async function (toEmail, ccEmail, subject, body) {
  logger.info(`sending email to: ${toEmail} cc: ${ccEmail} using SendGrid`);
  const sgMail = require("@sendgrid/mail");

  // Import SendGrid module and call with your SendGrid API Key
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);

  const msg = {
    from: process.env.OUTLOOK_USER,
    replyTo: process.env.OUTLOOK_USER,
    to: toEmail,
    cc: ccEmail != toEmail ? ccEmail : undefined,
    subject: subject,
    text: body
  };

  try {
    await sgMail.send(msg);
    return "OK";
  } catch (e) {
    return `Error: ${JSON.stringify(e)}`;
  }
};

const sendEmailViaOutlook = async function (toEmail, ccEmail, subject, body) {
  logger.info(`sending email to: ${toEmail} cc: ${ccEmail} using Outlook`);

  const mail = require("nodejs-nodemailer-outlook");
  await mail.sendEmail({
    auth: {
      user: process.env.OUTLOOK_USER,
      pass: process.env.OUTLOOK_PASS
    },
    from: process.env.OUTLOOK_USER,
    to: toEmail,
    cc: ccEmail,
    subject: subject,
    text: body,
    onError: e => logger.info(`Error - ${e}`),
    onSuccess: i => logger.info(`Success - ${JSON.stringify(i)}`)
  });

  return `sent email to ${toEmail}`;
};

const sendEmail = async function (toEmail, ccEmail, subject, body) {
  toEmail = toEmail.toLowerCase();
  if (ccEmail) {
    ccEmail = ccEmail.toLowerCase();
  }
  if (toEmail.includes("outlook") || toEmail.includes("hotmail")) {
    return await sendEmailViaOutlook(toEmail, ccEmail, subject, body);
  }
  return await sendEmailViaSendGrid(toEmail, ccEmail, subject, body);
};

const getLastWeek = function (addGmt8Offset) {
  var curr = new Date();
  var sunday = curr.getDate() - curr.getDay(); // Sunday is the day of the month - the day of the week
  if (curr.getDay() == 0) {
    // today is Sunday; we need last Sunday
    sunday -= 7;
  }

  curr.setDate(sunday);
  sunday = curr;
  sunday.setHours(23, 59, 59, 0);

  const monday = new Date(sunday.getTime() - 7 * DAY_IN_MS);
  monday.setHours(0, 0, 0, 0);

  if (addGmt8Offset) {
    const gmt8Offset = 8 * 60 * 60 * 1000; //8 hours in ms
    monday.setTime(monday.getTime() + gmt8Offset);
    sunday.setTime(sunday.getTime() + gmt8Offset);
  }

  return { monday, sunday };
};

const loadClassWithTeams = async function (classId) {
  var query = new Parse.Query("Class");
  query.equalTo("objectId", classId);
  const parseClass = await query.first();

  const classInfo = {
    parseClass,
    classTeams: []
  };

  query = new Parse.Query("Team");
  query.equalTo("classId", classId);
  query.ascending("index");
  const parseTeams = await query.limit(MAX_QUERY_COUNT).find();

  for (var i = 0; i < parseTeams.length; i++) {
    const parseTeam = parseTeams[i];
    const team = {
      parseTeam,
      members: []
    };

    var membersOrder = parseTeam.get("membersOrder");
    if (membersOrder) {
      membersOrder = membersOrder.split(",");
      for (var j = 0; j < membersOrder.length; j++) {
        query = new Parse.Query("User");
        query.equalTo("objectId", membersOrder[j]);
        const parseUser = await query.find(MASTER_KEY);
        team.members.push(parseUser[0]);
      }
    }
    classInfo.classTeams.push(team);
  }

  return classInfo;
};

const loadStudentAttendanceV2 = async function (userId, classSession) {
  var result = {};
  if (classSession) {
    var query = new Parse.Query("UserSessionAttendance");
    query.equalTo("userId", userId);
    query.equalTo("sessionId", classSession._getId());
    const parseUserSessionAttendance = await query.first();

    if (parseUserSessionAttendance) {
      result.attendance = parseUserSessionAttendance.get("attendance");
      result.onLeave = parseUserSessionAttendance.get("onLeave");
    }
  }

  logger.info(
    `loadStudentAttendanceV2 - userId: ${userId} sessionId: ${classSession ? classSession._getId() : undefined
    } result: ${JSON.stringify(result)}`
  );

  return result;
};

const loadUserMissedReportingStates = async function (
  parseUser,
  parseClass,
  lastSession,
  lastWeek
) {
  const results = [];
  const userId = parseUser._getId();
  logger.info(`loadUserMissedReportingStates - userId: ${userId}`);

  if (lastSession) {
    const attendance = await loadStudentAttendanceV2(userId, lastSession);
    var reported =
      attendance && (attendance.onLeave || attendance.attendance != undefined);
    if (!reported) {
      results.push("共修出席");
    }
  }

  var query = parseClass.relation("practices").query();
  query.ascending("index");
  const parsePractices = await query.find();

  for (var i = 0; i < parsePractices.length; i++) {
    const parsePractice = parsePractices[i];
    const startDate = parsePractice.get("startDate");
    if (startDate && startDate > lastWeek.sunday) {
      continue;
    }
    query = parsePractice.relation("counts").query();
    query.equalTo("userId", userId);
    query.greaterThanOrEqualTo("reportedAt", lastWeek.monday);
    query.lessThanOrEqualTo("reportedAt", lastWeek.sunday);
    const parseCounts = await query.find();
    if (!parseCounts.length) {
      query = parsePractice.relation("counts").query();
      query.equalTo("userId", userId);
      query.equalTo("reportedAt", undefined);
      const parseCount = await query.first();
      if (!parseCount || !parseCount.get("completed")) {
        results.push(parsePractice.get("name"));
      }
    }
  }

  return results;
};

const remindClassReporting = async function (classId) {
  const lastWeek = getLastWeek(true);
  const lastWeekForEmail = getLastWeek(false);
  logger.info(
    `remindClassReporting - classId: ${classId} lastWeek: ${JSON.stringify(
      lastWeek
    )}`
  );

  const emailsSent = [];
  const classInfo = await loadClassWithTeams(classId);
  const parseClass = classInfo.parseClass;
  const subject = `${parseClass.get("name")}学修报数提醒`;

  var query = parseClass.relation("sessions").query();
  query.greaterThanOrEqualTo("scheduledAt", lastWeek.monday);
  query.lessThanOrEqualTo("scheduledAt", lastWeek.sunday);
  const lastSession = await query.first();

  var leaderEmail;
  for (var i = 0; i < classInfo.classTeams.length; i++) {
    const team = classInfo.classTeams[i];
    for (var j = 0; j < team.members.length; j++) {
      const parseUser = team.members[j];
      const email = parseUser.get("email");
      if (j == 0) {
        leaderEmail = email;
      }
      if (email) {
        const states = await loadUserMissedReportingStates(
          parseUser,
          parseClass,
          lastSession,
          lastWeek
        );
        if (states.length) {
          const statesStr = states.join("，");
          const body = `${parseUser.get(
            "name"
          )}师兄，\n\n南无阿弥陀佛！温馨提醒：您还没有完成上周（${toLocalDateString(
            lastWeekForEmail.monday
          )} - ${toLocalDateString(
            lastWeekForEmail.sunday
          )}）以下项目的报数：${statesStr}。请点以下链接，登录网站并完成报数：\n\nhttps://amitabha.herokuapp.com/online/ \n\n新加坡智悲佛学会\nAMITABHA`;

          const result = await sendEmail(email, leaderEmail, subject, body);
          logger.info(
            `sent email to ${email} cc ${leaderEmail} result: ${result}`
          );
          emailsSent.push({ email, result });
        }
      }
    }
  }
  return { lastWeek, lastWeekForEmail, emailsSent };
};

const updateUserStudyRecord = async function (user, pathname, userStudyRecord) {
  requireAuth(user);

  const result = {};
  const userId = user.id;

  logger.info(
    `updateUserStudyRecord - userId: ${userId} pathname: ${pathname}}`
  );

  pathname = pathname.replace("/amitabha", "");
  var query = new Parse.Query("Submodule");
  query.contains("url", pathname);
  var submodule = await query.first();

  if (submodule) {
    const submoduleId = submodule._getId();
    query = new Parse.Query("UserStudyRecord");

    query.equalTo("userId", userId);
    query.equalTo("submoduleId", submoduleId);
    var parseUserStudyRecord = await query.first();

    if (!parseUserStudyRecord) {
      parseUserStudyRecord = new Parse.Object("UserStudyRecord");
      parseUserStudyRecord.set("userId", user.id);
      parseUserStudyRecord.set("submoduleId", submoduleId);
    }

    parseUserStudyRecord.set("lineage", userStudyRecord.lineage);
    parseUserStudyRecord.set("textbook", userStudyRecord.textbook);

    parseUserStudyRecord = await parseUserStudyRecord.save(null, MASTER_KEY);

    result.lineage = parseUserStudyRecord.get("lineage");
    result.textbook = parseUserStudyRecord.get("textbook");
  }

  return result;
};

const sendVerificationEmailForUser = async function (user) {
  if (user.get("verificationEmailRequested") === "confirmEmail") {
    const email = user.get("email");
    if (email) {
      let newEmail = email.trim();
      if (newEmail === email) {
        newEmail = email + " ";
      }
      user.set("email", newEmail);
      logger.info(`sent verification email to [${email}]`);
    }
  } else {
    const email = user.get("email");
    await Parse.User.requestPasswordReset(email);
    logger.info(`sent password reset email to [${email}]`);
  }
  user.unset("verificationEmailRequested");
  return await user.save(null, MASTER_KEY);
};

const sendVerificationEmail = async function (params) {
  const date = new Date();
  const timeNow = date.getTime();

  logger.info(`sendVerificationEmail started at ${date}  - params: ${JSON.stringify(params)}`);
  try {
    if (params && params.userId) {
      let query = new Parse.Query(Parse.User);
      query.equalTo("objectId", params.userId);
      let parseUser = await query.first(MASTER_KEY);
      if (parseUser) {
        await sendVerificationEmailForUser(parseUser);
        logger.info("sendVerificationEmail finished at " + new Date());
        return;
      }
    }

    const intervalOfTime = 7 * DAY_IN_MS; // the time set is 7 days in milliseconds
    const timeThen = timeNow + intervalOfTime;

    const expiredDate = new Date();
    expiredDate.setTime(timeThen);

    let query = new Parse.Query(Parse.User);
    query.equalTo("emailVerified", false);
    let results = await query.find(MASTER_KEY);

    for (let i = 0; i < results.length; i++) {
      const user = results[i];
      if (user.get("createdAt") < expiredDate) {
        if (user.get("verificationEmailRequested") === "confirmEmail") {
          await sendVerificationEmailForUser(user);
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

    query = new Parse.Query(Parse.User);
    query.equalTo("verificationEmailRequested", "passwordReset");
    results = await query.find(MASTER_KEY);

    for (let i = 0; i < results.length; i++) {
      const user = results[i];
      await sendVerificationEmailForUser(user);
    }
  } catch (e) {
    logger.info("Exception in sendVerificationEmail: " + JSON.stringify(e));
    console.error(e);
  }

  logger.info("sendVerificationEmail finished at " + new Date());
};

const logResponse = function (response) {
  logger.info('Response status: ' + response.status);
  let responseData;
  if (process.env.NODE_ENV === "development") {
    responseData = "\n" + JSON.stringify(response.data, null, 2);
  } else {
    responseData = JSON.stringify(response.data);
  }
  logger.info('Response data: ' + responseData);
};

const triggerB4aSendVerificationEmail = async function (userId) {
  const headers = {
    'X-Parse-Application-Id': process.env.VUE_APP_PARSE_APP_ID,
    'X-Parse-Master-Key': process.env.PARSE_MASTER_KEY,
  };
  const b4aParseServerUrl = process.env.B4A_PARSE_SERVER_URL || "https://parseapi.back4app.com";
  const url = `${b4aParseServerUrl}/jobs/sendVerificationEmail`;
  const body = { userId };
  logger.info(`Starting request - url: ${url} body: ${JSON.stringify(body)}`);
  await axios
    .post(url, body, { headers })
    .then(async response => {
      logResponse(response);;
    })
    .catch(error => {
      if (error.response) {
        // Request made and server responded
        logResponse(error.response);
      } else {
        logger.info('Error message: ' + error.message);
        logger.info('Error request: ' + error.request);
      }
    });
};

const loadInfoViaYoutubeApi = async function (youtubeId) {
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${youtubeId}&key=${process.env.YOUTUBE_API_KEY}`;
  logger.info(`Starting request - url: ${url}`);
  return await axios
    .get(url)
    .then(async response => {
      logResponse(response);
      let thumbnail;
      const { items } = response.data;
      const snippet = items[0] ? items[0].snippet : {};
      return { title: snippet.title, description: snippet.description };
    })
    .catch(error => {
      if (error.response) {
        // Request made and server responded
        logResponse(error.response);
      } else {
        logger.info('Error message: ' + error.message);
        logger.info('Error request: ' + error.request);
      }
      console.error(error);
      throw "Error: " + error;
    });
};

async function processYoutubeFormats(youtubeId, formats, shortenUrl = false) {
  formats.sort((a, b) => b.height - a.height);

  if (shortenUrl) {
    let parseYoutube;

    let query = new Parse.Query("Youtube");
    query.equalTo("youtubeId", youtubeId);
    parseYoutube = await query.first();

    if (!parseYoutube) {
      parseYoutube = new Parse.Object("Youtube");
      parseYoutube.set("youtubeId", youtubeId);
    }

    parseYoutube.set("formats", formats);
    parseYoutube = await parseYoutube.save(null, MASTER_KEY);

    for (let i = 0; i < formats.length; i++) {
      const format = formats[i]
      format.url = `../proxy/yt/${youtubeId}/${format.height}`;
    }
  }
}

const loadYoutubeInfo = async function (youtubeId, singleFormat) {
  try {
    const url = `https://www.youtube.com/watch?v=${youtubeId}`;
    logger.info(`Starting youtubedl request - url: ${url}`);
    const youtubeDownload = require('youtube-dl-exec');

    const result = await youtubeDownload(url, {
      dumpSingleJson: true,
      noWarnings: true,
      noCallHome: true,
      noCheckCertificate: true,
      preferFreeFormats: true,
      youtubeSkipDashManifest: true,
      referer: process.env.PUBLIC_SERVER_URL
    });

    let height = 0;
    let selectedFormat = {};
    let formats = [];
    const targetHeight = 360;
    for (let i = 0; i < result.formats.length; i++) {
      const format = result.formats[i];
      if (format.ext === "mp4" && format.acodec !== "none") {
        const validFormat = { height: format.height, url: format.url, format: format.format };
        formats.push(validFormat);
        if ((height < targetHeight && format.height > height) ||
          (height > targetHeight && format.height < height)) {
          height = format.height;
          selectedFormat = validFormat;
        }
      }
    }

    await processYoutubeFormats(youtubeId, formats);
    logger.info(`processed formats:\n${JSON.stringify(formats, null, 4)}`);

    if (singleFormat) {
      formats = [selectedFormat];
      logger.info(`single format:\n${JSON.stringify(formats, null, 4)}`);
    }
    
    return { height, downloadUrl: selectedFormat.url, title: result.title, description: result.description, formats };
  } catch (e) {
    logger.info("loadYoutubeInfo error:");
    console.error(e);
  }

  return await loadInfoViaYoutubeApi(youtubeId);
};

function canSendEmailTo(email) {
  if (process.env.BACK4APP) {
    return true;
  }
  return email && !email.includes("@outlook") && !email.includes("@hotmail");
};

module.exports = {
  requireAuth,
  requireRole,
  reportPracticeCountV2,
  updateAttendanceV2,
  getDatesFromCsvHeader,
  prepareReportGeneration,
  formatCount,
  formatMinutes,
  sendEmail,
  remindClassReporting,
  toLocalDateString,
  getLastWeek,
  loadStudentAttendanceV2,
  updateUserStudyRecord,
  sendVerificationEmail,
  triggerB4aSendVerificationEmail,
  loadYoutubeInfo,
  canSendEmailTo,
  DAY_IN_MS
};
