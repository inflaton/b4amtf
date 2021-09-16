/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */
require("./adminFunctions.cjs");

const MASTER_KEY = { useMasterKey: true };
const MAX_QUERY_COUNT = 3000;
const logger = require("parse-server").logger;
const commonFunctions = require("./commonFunctions.cjs");

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

Parse.Cloud.define(
  "user:signup",
  async ({ params: { name, username, email, password, phone } }) => {
    let verificationEmailRequested = commonFunctions.canSendEmailTo(email) ? undefined : "confirmEmail";
    let parseUser = new Parse.User({
      name,
      email,
      password,
      username,
      phone,
      verificationEmailRequested
    });
    parseUser = await parseUser.save(null, MASTER_KEY);
    if (!commonFunctions.canSendEmailTo(email)) {
      await commonFunctions.triggerB4aSendVerificationEmail(parseUser.id);
    }
    return parseUser;
  }
);

const loadUserRoles = async function (parseUser) {
  var userRoleQuery = new Parse.Query(Parse.Role);
  userRoleQuery.equalTo("users", parseUser);
  const roles = await userRoleQuery.find(MASTER_KEY);
  return roles.length > 0 ? roles.map(r => r.get("name")) : ["StudentUser"];
};

const loadUserDetails = async function (parseUser) {
  const rolesToReturn = await loadUserRoles(parseUser);
  return {
    id: parseUser.id,
    name: parseUser.get("name"),
    username: parseUser.get("username"),
    phone: parseUser.get("phone"),
    email: parseUser.get("email"),
    emailVerified: parseUser.get("emailVerified"),
    state: parseUser.get("state"),
    roles: rolesToReturn
  };
};

Parse.Cloud.define("user:getRoles", async ({ user }) => {
  return await loadUserDetails(user);
});

Parse.Cloud.define(
  "user:adminFetchUsers",
  async ({ user, params: { user: userWithRoles } }) => {
    requireAuth(user);
    requireRole(userWithRoles, "B4aAdminUser");

    var userQuery = new Parse.Query(Parse.User);
    userQuery.ascending("name");
    const parseUsers = await userQuery.limit(MAX_QUERY_COUNT).find(MASTER_KEY);
    const usersCount = parseUsers.length;
    const users = [];
    for (var i = 0; i < usersCount; i++) {
      users.push(await loadUserDetails(parseUsers[i]));
    }
    return { users, usersCount };
  }
);

Parse.Cloud.define(
  "user:adminFetchUser",
  async ({ user, params: { user: userWithRoles, userSlug } }) => {
    requireAuth(user);
    requireRole(userWithRoles, "B4aAdminUser");

    var userQuery = new Parse.Query(Parse.User);
    userQuery.equalTo("objectId", userSlug);
    var parseUser = await userQuery.first(MASTER_KEY);

    return await loadUserDetails(parseUser);
  }
);

Parse.Cloud.define(
  "user:adminUpdateUser",
  async ({ user, params: { user: userWithRoles, userToUpdate } }) => {
    requireAuth(user);
    requireRole(userWithRoles, "B4aAdminUser");

    const array = [
      { enabled: userToUpdate.isSystemAdmin, roleName: "B4aAdminUser" },
      { enabled: userToUpdate.isClassAdmin, roleName: "ClassAdminUser" },
      { enabled: userToUpdate.isTeacher, roleName: "TeacherUser" },
      {
        enabled: userToUpdate.isTeachingAssistant,
        roleName: "TeachingAssistantUser"
      },
      { enabled: userToUpdate.isStudent, roleName: "StudentUser" }
    ];

    var parseUser;
    if (userToUpdate.id) {
      var userQuery = new Parse.Query(Parse.User);
      userQuery.equalTo("objectId", userToUpdate.id);
      parseUser = await userQuery.first(MASTER_KEY);
    } else {
      parseUser = new Parse.User(MASTER_KEY);
    }

    parseUser.set("username", userToUpdate.username);
    parseUser.set("name", userToUpdate.name);
    parseUser.set("phone", userToUpdate.phone);
    parseUser.set("email", userToUpdate.email);

    if (userToUpdate.state === "blocked") {
      parseUser.set("emailVerified", false); // blocking user form login
    } else {
      if (userToUpdate.password) {
        parseUser.set("password", userToUpdate.password);
        userToUpdate.state = "needToChangePassword"; // user needs to update password in next login
      }
    }

    if (userToUpdate.state) {
      parseUser.set("state", userToUpdate.state);
    } else {
      parseUser.unset("state");
    }

    parseUser = await parseUser.save(null, MASTER_KEY);

    if (userToUpdate.state !== "blocked") {
      parseUser.set("emailVerified", true);
      parseUser = await parseUser.save(null, MASTER_KEY);
    }

    var userRoleQuery = new Parse.Query(Parse.Role);
    userRoleQuery.equalTo("users", parseUser);
    var roles = await userRoleQuery.find(MASTER_KEY);
    var roleNames = [];

    for (var n = 0; n < array.length; n++) {
      const i = array[n];
      if (i.enabled) {
        roleNames.push(i.roleName);
      }

      const existing = roles.some(r => r.get("name") === i.roleName);
      if (i.enabled != existing) {
        var roleQuery = new Parse.Query(Parse.Role);
        roleQuery.equalTo("name", i.roleName);
        var role = await roleQuery.first(MASTER_KEY);
        const relation = role.relation("users");

        if (i.enabled) {
          relation.add(parseUser);
        } else {
          relation.remove(parseUser);
        }
        await role.save(null, MASTER_KEY);
      }
    }

    return await loadUserDetails(parseUser);
  }
);

const loadStudentAttendance = async function (userId, classSession) {
  logger.info(
    `loadStudentAttendance - userId: ${userId} classSession: ${JSON.stringify(
      classSession
    )}`
  );

  var result = {};
  if (classSession) {
    var query = classSession.relation("attendances").query();
    query.equalTo("userId", userId);
    const attendance = await query.first();

    logger.info(`loadStudentAttendance - attendance: ${attendance}`);

    if (attendance) {
      result = {
        chuanCheng: attendance.get("chuanCheng"),
        faBen: attendance.get("faBen"),
        fuDao: attendance.get("fuDao"),
        shangKe: attendance.get("shangKe"),
        qingJia: attendance.get("qingJia")
      };

      logger.info(`loadStudentAttendance - result: ${JSON.stringify(result)}`);
    }
  }
  return result;
};

const loadStudentPracticeDetails = async function (userId, practices) {
  logger.info(`loadStudentPracticeDetails - userId: ${userId}`);

  var counts = [];
  var sessions = [];
  if (practices && practices.length > 0) {
    for (var i = 0; i < practices.length; i++) {
      var practiceCount = {};
      var relation = practices[i].relation("counts");
      var query = relation.query();
      query.equalTo("userId", userId);
      query.equalTo("reportedAt", undefined);
      const accumulatedCount = await query.first();

      if (accumulatedCount) {
        query = relation.query();
        query.equalTo("userId", userId);
        query.descending("reportedAt");
        const latestCount = await query.first();

        practiceCount.count = latestCount.get("count");
        practiceCount.reportedAt = latestCount.get("reportedAt");
        practiceCount.accumulatedCount = accumulatedCount.get("count");
      }
      counts.push(practiceCount);

      relation = practices[i].relation("sessions");
      query = relation.query();
      const practiceSessions = await query.limit(MAX_QUERY_COUNT).find();

      sessions.push(practiceSessions);
    }
  }

  return { counts: counts, sessions: sessions };
};

// eslint-disable-next-line no-unused-vars
const populateSessions = async function (parseClass) {
  var relation = parseClass.relation("sessions");
  var query = relation.query();
  const done = await query.first();

  if (!done) {
    const url = parseClass.get("url");
    query = new Parse.Query("ClassSession");
    query.startsWith("url", url);

    var allSessions = await query.limit(MAX_QUERY_COUNT).find();
    for (var i = 0; i < allSessions.length; i++) {
      relation.add(allSessions[i]);
      logger.info(
        `populateSessions - i: ${i} classSession: ${allSessions[i].get("name")}`
      );
    }

    await parseClass.save(null, MASTER_KEY);
  }
};

const generateClassSnapshotJson = async function (parseClass) {
  logger.info(`generateClassSnapshotJson - classId: ${parseClass.id}`);

  const result = {};
  var query = parseClass.relation("students").query();
  result.studentCount = await query.count();

  const sessions = parseClass.relation("sessions");
  query = sessions.query();
  result.sessionTotal = await query.count();

  query = sessions.query();
  query.exists("scheduledAt");
  result.sessionScheduled = await query.count();

  query = sessions.query();
  query.exists("scheduledAt");
  query.lessThanOrEqualTo("scheduledAt", new Date());
  result.sessionCompleted = await query.count();

  return JSON.stringify(result);
};

const generateSessionSnapshotJson = async function (parseSession) {
  logger.info(`generateSessionSnapshotJson - sessionId: ${parseSession.id}`);

  const result = { chuanCheng: 0, faBen: 0, shangKe: 0 };
  var query = parseSession.relation("attendances").query();
  var attendances = await query.limit(MAX_QUERY_COUNT).find();

  for (var i = 0; i < attendances.length; i++) {
    const attendance = attendances[i];
    if (attendance.get("chuanCheng")) {
      result.chuanCheng += 1;
    }
    if (attendance.get("faBen")) {
      result.faBen += 1;
    }
    if (attendance.get("shangKe")) {
      result.shangKe += 1;
    }
  }

  return JSON.stringify(result);
};

const generatePracticeSnapshotJson = async function (parsePractice) {
  logger.info(`generatePracticeSnapshotJson - classId: ${parsePractice.id}`);

  const relation = parsePractice.relation("counts");
  var query = relation.query();
  // query.notEqualTo("reportedAt", undefined);

  // total will be a newly created field to hold the sum of score field
  var pipeline = [{ group: { objectId: null, total: { $sum: "$count" } } }];
  const results = await query.aggregate(pipeline);
  const accumulatedCount = results.length ? results[0].total / 2 : 0;
  logger.info(
    `generatePracticeSnapshotJson - accumulatedCount: ${accumulatedCount}`
  );

  var practiceCount = {};
  practiceCount.accumulatedCount = accumulatedCount;
  practiceCount.reportedAt = new Date();

  return JSON.stringify(practiceCount);
};

const loadSnapshot = async function (parseObject, generateSnapshotJson) {
  const objectId = parseObject.id;
  logger.info(`loadSnapshot - objectId: ${objectId}`);

  var query = new Parse.Query("Snapshot");
  query.equalTo("forObjectId", objectId);
  var snapshot = await query.first();

  var needToRegenerate = true;

  if (!snapshot) {
    snapshot = new Parse.Object("Snapshot");
    snapshot.set("forObjectId", objectId);
  } else {
    const today = new Date();
    //refresh every 1 hour
    needToRegenerate =
      today.getTime() > snapshot.updatedAt.getTime() + 1 * 60 * 60 * 1000;
  }

  if (needToRegenerate) {
    const json = await generateSnapshotJson(parseObject);
    snapshot.set("json", json);
    snapshot = await snapshot.save(null, MASTER_KEY);
  }

  return snapshot;
};

const loadPracticeSnapshots = async function (practices) {
  logger.info(`loadPracticeSnapshots - practices: ${practices}`);

  var result = [];
  if (practices && practices.length > 0) {
    for (var i = 0; i < practices.length; i++) {
      const practiceCount = await loadSnapshot(
        practices[i],
        generatePracticeSnapshotJson
      );
      result.push(practiceCount);
    }
  }

  return result;
};

const loadDashboard = async function (parseUser, forStudent) {
  const userId = parseUser ? parseUser._getId() : undefined;
  const dashboard = forStudent
    ? {
      enrolledClasses: [],
      newClasses: []
    }
    : {
      classes: []
    };

  var query = new Parse.Query("Class");

  //undefined if loading System Admin Dashboard
  if (parseUser) {
    if (forStudent) {
      query.equalTo("students", parseUser);
    } else {
      query.equalTo("classAdminUsers", parseUser);
    }
  }

  var parseClasses = await query.find();
  const enrolledClassList = [];

  for (var i = 0; i < parseClasses.length; i++) {
    const parseClass = parseClasses[i];
    const classInfo = {
      id: parseClass._getId(),
      name: parseClass.get("name"),
      url: parseClass.get("url"),
      classSessions: [],
      attendances: [],
      practices: [],
      counts: [],
      practiceSessions: []
    };
    enrolledClassList.push(parseClass._getId());

    query = parseClass.relation("classAdminUsers").query();
    const classAdminUsers = await query.find();
    classInfo.teachers = classAdminUsers.map(u => u.get("name"));

    query = parseClass.relation("sessions").query();
    var d = new Date();
    query.greaterThan("scheduledAt", d);
    query.ascending("scheduledAt");
    const nextSession = await query.first();
    if (nextSession) {
      classInfo.classSessions.push(nextSession);
      var attendance;
      if (forStudent) {
        attendance = await loadStudentAttendance(userId, nextSession);
      } else {
        attendance = await loadSnapshot(
          nextSession,
          generateSessionSnapshotJson
        );
      }
      logger.info(`loadDashboard - attendance: ${JSON.stringify(attendance)}`);
      classInfo.attendances.push(attendance);
    }

    query = parseClass.relation("sessions").query();
    query.lessThanOrEqualTo("scheduledAt", d);
    query.descending("scheduledAt");
    const lastSession = await query.first();
    if (lastSession) {
      classInfo.classSessions.push(lastSession);

      if (forStudent) {
        attendance = await loadStudentAttendance(userId, lastSession);
      } else {
        attendance = await loadSnapshot(
          lastSession,
          generateSessionSnapshotJson
        );
      }
      logger.info(`loadDashboard - attendance: ${JSON.stringify(attendance)}`);
      classInfo.attendances.push(attendance);
    }

    query = parseClass.relation("practices").query();
    query.ascending("index");
    classInfo.practices = await query.find();

    if (forStudent) {
      const practiceDetails = await loadStudentPracticeDetails(
        userId,
        classInfo.practices
      );
      classInfo.counts = practiceDetails.counts;
      classInfo.practiceSessions = practiceDetails.sessions;
    } else {
      classInfo.counts = await loadPracticeSnapshots(classInfo.practices);
      classInfo.snapshot = await loadSnapshot(
        parseClass,
        generateClassSnapshotJson
      );
    }

    if (forStudent) {
      dashboard.enrolledClasses.push(classInfo);
    } else {
      dashboard.classes.push(classInfo);
      // await populateSessions(parseClass);
    }
  }

  if (forStudent) {
    query = new Parse.Query("Class");
    query.equalTo("openForApplication", true);
    // query.exclude("objectId", enrolledClassList); TODO: how to do SQL NOT IN [a, b, c]
    parseClasses = await query.find();

    for (i = 0; i < parseClasses.length; i++) {
      const parseClass = parseClasses[i];
      const id = parseClass._getId();
      if (enrolledClassList.includes(id)) {
        continue;
      }
      const classInfo = {
        id: id,
        name: parseClass.get("name"),
        url: parseClass.get("url")
      };

      query = parseClass.relation("classAdminUsers").query();
      const classAdminUsers = await query.find();
      classInfo.teachers = classAdminUsers.map(u => u.get("name"));

      dashboard.newClasses.push(classInfo);
    }
  }

  return dashboard;
};

Parse.Cloud.define(
  "home:loadDashboards",
  async ({ user, params: { user: userWithRoles } }) => {
    requireAuth(user);

    const result = {};
    if (userWithRoles.roles.includes("StudentUser")) {
      result.studentDashboard = await loadDashboard(user, true);
    }

    if (userWithRoles.roles.includes("ClassAdminUser")) {
      result.classAdminDashboard = await loadDashboard(user, false);
    }

    if (userWithRoles.roles.includes("B4aAdminUser")) {
      result.systemAdminDashboard = await loadDashboard();
    }

    return result;
  }
);

Parse.Cloud.define(
  "home:getAttendance",
  async ({ user, params: { pathname } }) => {
    requireAuth(user);

    pathname = pathname.replace("/amitabha", "");
    var query = new Parse.Query("ClassSession");
    query.contains("url", pathname);
    var session = await query.first();
    if (!session) {
      query = new Parse.Query("PracticeSession");
      query.contains("url", pathname);
      session = await query.first();
    }
    return loadStudentAttendance(user.id, session);
  }
);

Parse.Cloud.define(
  "home:updateAttendance",
  async ({ user, params: { pathname, attendance } }) => {
    requireAuth(user);

    const result = {};
    pathname = pathname.replace("/amitabha", "");
    var query = new Parse.Query("ClassSession");
    query.contains("url", pathname);
    var session = await query.first();

    if (!session) {
      query = new Parse.Query("PracticeSession");
      query.contains("url", pathname);
      session = await query.first();
    }

    if (session) {
      const relation = session.relation("attendances");
      query = relation.query();

      query.equalTo("userId", user.id);
      var parseAttendance = await query.first();

      const creatingAttendance = !parseAttendance;
      if (creatingAttendance) {
        parseAttendance = new Parse.Object("Attendance");
        parseAttendance.set("userId", user.id);
      }

      if (attendance) {
        parseAttendance.set("chuanCheng", attendance.chuanCheng);
        parseAttendance.set("faBen", attendance.faBen);
        parseAttendance.set("fuDao", attendance.fuDao);
        parseAttendance.set("shangKe", attendance.shangKe);
        parseAttendance.set("qingJia", attendance.qingJia);
      }

      parseAttendance = await parseAttendance.save(null, MASTER_KEY);

      if (creatingAttendance) {
        relation.add(parseAttendance);
        await session.save(null, MASTER_KEY);
      }

      result.chuanCheng = parseAttendance.get("chuanCheng");
      result.faBen = parseAttendance.get("faBen");
      result.fuDao = parseAttendance.get("fuDao");
      result.shangKe = parseAttendance.get("shangKe");
      result.qingJia = parseAttendance.get("qingJia");
    }

    return result;
  }
);

const loadUserStudyRecord = async function (userId, submoduleId) {
  logger.info(
    `loadUserStudyRecord - userId: ${userId} submoduleId: ${submoduleId}`
  );

  var result = {};
  var query = new Parse.Query("UserStudyRecord");
  query.equalTo("userId", userId);
  query.equalTo("submoduleId", submoduleId);
  var record = await query.first();

  if (record) {
    result.lineage = record.get("lineage");
    result.textbook = record.get("textbook");
  }
  return result;
};

Parse.Cloud.define(
  "home:getUserStudyRecord",
  async ({ user, params: { pathname } }) => {
    requireAuth(user);
    const userId = user.id;

    logger.info(`getUserStudyRecord - userId: ${userId} pathname: ${pathname}`);

    pathname = pathname.replace("/amitabha", "");
    var query = new Parse.Query("Submodule");
    query.contains("url", pathname);
    var submodule = await query.first();

    return loadUserStudyRecord(userId, submodule._getId());
  }
);

Parse.Cloud.define(
  "home:updateUserStudyRecord",
  async ({ user, params: { pathname, userStudyRecord } }) => {
    return await commonFunctions.updateUserStudyRecord(
      user,
      pathname,
      userStudyRecord
    );
  }
);

Parse.Cloud.define(
  "home:reportPracticeCount",
  async ({
    user,
    params: { practiceId, practiceSessionId, reportedAt, count }
  }) => {
    requireAuth(user);

    var userId = user.id;
    logger.info(
      `home:reportPracticeCount - userId: ${userId} practiceId: ${practiceId} practiceSessionId: ${practiceSessionId} reportedAt: ${reportedAt} count: ${count}`
    );

    var query = new Parse.Query("Practice");
    query.equalTo("objectId", practiceId);
    const practice = await query.first();
    const relation = practice.relation("counts");
    var newCount = false;
    var delta = count;

    query = relation.query();
    query.equalTo("userId", userId);
    query.equalTo("sessionId", practiceSessionId);
    query.equalTo("reportedAt", reportedAt);
    var currentPracticeCount = await query.first();

    if (!currentPracticeCount) {
      currentPracticeCount = new Parse.Object("UserPracticeCount");
      currentPracticeCount.set("userId", userId);
      currentPracticeCount.set("reportedAt", reportedAt);
      currentPracticeCount.set("sessionId", practiceSessionId);
      newCount = true;
    } else {
      delta -= currentPracticeCount.get("count");
    }

    currentPracticeCount.set("count", count);
    currentPracticeCount = await currentPracticeCount.save(null, MASTER_KEY);

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
      relation.add(currentPracticeCount);
      relation.add(accumulatedCount);
      await practice.save(null, MASTER_KEY);
    }

    return {
      id: currentPracticeCount._getId(),
      count: currentPracticeCount.get("count"),
      reportedAt: currentPracticeCount.get("reportedAt"),
      accumulatedCount: accumulatedCount.get("count")
    };
  }
);
function parseSessionIndex(sessionName) {
  const match = sessionName.match(/(\d+)/);
  return match ? parseInt(match[0]) : 0;
}

Parse.Cloud.define(
  "class:fetchPracticeCounts",
  async ({ user, params: { practiceId, forAdmin } }) => {
    requireAuth(user);

    var userId = user.id;
    logger.info(
      `home:fetchPracticeCounts - userId: ${userId} practiceId: ${practiceId} forAdmin: ${forAdmin}`
    );

    var query = new Parse.Query("Practice");
    query.equalTo("objectId", practiceId);
    const practice = await query.first();
    const result = {
      forAdmin: forAdmin,
      practice: practice,
      counts: [],
      users: [],
      sessions: []
    };
    var relation = practice.relation("counts");

    query = relation.query();
    if (forAdmin) {
      query.equalTo("reportedAt", undefined);
    } else {
      query.equalTo("userId", userId);
      query.descending("reportedAt");
    }
    result.counts = await query.limit(MAX_QUERY_COUNT).find();

    if (forAdmin) {
      for (var i = 0; i < result.counts.length; i++) {
        var userQuery = new Parse.Query(Parse.User);
        userQuery.equalTo("objectId", result.counts[i].get("userId"));
        const parseUser = await userQuery.first();
        result.users.push(parseUser.get("name"));
      }
    } else {
      relation = practice.relation("sessions");
      query = relation.query();
      const sessions = await query.limit(MAX_QUERY_COUNT).find();
      result.sessions = sessions.map(e => {
        return { id: e.id, name: e.get("name") };
      });
      result.sessions.sort((s1, s2) => {
        var a = parseSessionIndex(s1.name);
        var b = parseSessionIndex(s2.name);
        return a > b ? 1 : b > a ? -1 : 0;
      });
    }

    return result;
  }
);

Parse.Cloud.define(
  "class:fetchSessions",
  async ({ user, params: { classId, forApplication, forAdmin } }) => {
    requireAuth(user);

    var query = new Parse.Query("Class");
    query.equalTo("objectId", classId);
    const parseClass = await query.first();

    const classInfo = {
      id: parseClass._getId(),
      name: parseClass.get("name"),
      url: parseClass.get("url"),
      forApplication: forApplication,
      forAdmin: forAdmin,
      classSessions: [],
      attendances: []
    };

    query = parseClass.relation("sessions").query();
    query.descending("scheduledAt");
    const classSessions = await query.limit(MAX_QUERY_COUNT).find();

    for (var i = 0; i < classSessions.length; i++) {
      const classSession = classSessions[i];
      classInfo.classSessions.push(classSession);

      if (forApplication || !classSession.get("scheduledAt")) {
        classInfo.attendances.push(undefined);
      } else {
        const attendance = forAdmin
          ? await loadSnapshot(classSession, generateSessionSnapshotJson)
          : await loadStudentAttendance(user.id, classSession);
        classInfo.attendances.push(attendance);
      }
    }

    return classInfo;
  }
);

Parse.Cloud.define("class:apply", async ({ user, params: { classId } }) => {
  requireAuth(user);

  var query = new Parse.Query("Class");
  query.equalTo("objectId", classId);
  const parseClass = await query.first(MASTER_KEY);

  var userQuery = new Parse.Query(Parse.User);
  userQuery.equalTo("objectId", user.id);
  var parseUser = await userQuery.first(MASTER_KEY);

  parseClass.relation("students").add(parseUser);

  return await parseClass.save(null, MASTER_KEY);
});

Parse.Cloud.define(
  "class:updateClassSession",
  async ({ user, params: { session } }) => {
    requireAuth(user);

    logger.info(
      `updateClassSession - userId: ${user.id} session: ${JSON.stringify(
        session
      )}`
    );

    var result = {};
    var query = new Parse.Query("ClassSession");
    query.equalTo("objectId", session.id);
    var classSession = await query.first();

    if (classSession) {
      classSession.set("scheduledAt", session.scheduledAt);
      classSession.set("description", session.description);
      await classSession.save(null, MASTER_KEY);

      result = classSession;
    }

    if (session.id != session.oldId) {
      query = new Parse.Query("ClassSession");
      query.equalTo("objectId", session.oldId);
      classSession = await query.first();

      if (classSession) {
        classSession.unset("scheduledAt");
        await classSession.save(null, MASTER_KEY);
      }
    }

    return result;
  }
);
