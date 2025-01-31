/* eslint-disable no-await-in-loop */
const MASTER_KEY = { useMasterKey: true };
const logger = require("parse-server").logger;

const processSubmodule = async function (submodule) {
  logger.info(`processSubmodule: ${JSON.stringify(submodule)}`);
  const query = new Parse.Query("Module");
  query.equalTo("moduleId", submodule.get("moduleId"));
  const module = await query.first();
  submodule.set("moduleId", module.id);
};

const processClassSession = async function (classSession) {
  logger.info(`processClassSession: ${JSON.stringify(classSession)}`);
  const submodules = classSession.get("content").submodules;
  for (let i = 0; i < submodules.length; i++) {
    const query = new Parse.Query("Submodule");
    query.equalTo("submoduleId", submodules[i]);
    const submodule = await query.first();
    submodules[i] = submodule.id;
  }
};

const processUser = async function (user) {
  logger.info(`processUser: ${JSON.stringify(user)}`);
  user.set("password", "amituofo2021");
};

Parse.Cloud.define("import", async (request) => {
  if (!request.master) {
    return "master key required";
  }
  const className = request.params.className;
  const rows = request.params.results;

  const MyClass = Parse.Object.extend(className);

  const myClassObjects = [];
  for (let i = 0; i < rows.length; i++) {
    const myClassObject = new MyClass();

    for (const column in rows[i]) {
      myClassObject.set(column, rows[i][column]);
    }

    if (className === "Submodule") {
      await processSubmodule(myClassObject);
    } else if (className === "ClassSession") {
      await processClassSession(myClassObject);
    } else if (className === "_User") {
      await processUser(myClassObject);
    }

    myClassObjects.push(myClassObject);
  }

  try {
    await Parse.Object.saveAll(myClassObjects, MASTER_KEY);
  } catch (e) {
    throw new Error(`Import failed: ${e}`);
  }

  return `Successfully imported ${myClassObjects.length} rows into ${className} class`;
});

Parse.Cloud.define("createModule", async (request) => {
  if (!request.master) {
    return "master key required";
  }
  const name = request.params.name;
  const url = request.params.url;
  const moduleId = request.params.moduleId;

  let query = new Parse.Query("Module");
  let module;
  let index;

  if (moduleId) {
    query.equalTo("objectId", moduleId);
    module = await query.first();
  }

  if (module) {
    index = module ? module.get("index") : index;
  } else {
    query = new Parse.Query("Module");
    query.descending("index");
    const lastModule = await query.first();
    index = lastModule ? lastModule.get("index") + 1 : 1;
    module = new Parse.Object("Module");
  }

  logger.info(`creating module with name: ${name} url: ${url} index: ${index}`);

  module.set("name", name);
  module.set("url", url);
  module.set("index", index);
  module = await module.save();

  return { id: module.id, index };
});

Parse.Cloud.define("createSubmodule", async (request) => {
  if (!request.master) {
    return "master key required";
  }
  const index = request.params.index;
  const name = request.params.name;
  const url = request.params.url;
  const moduleId = request.params.moduleId;
  logger.info(
    `creating submodule with index: ${index} name: ${name} url: ${url} moduleId: ${moduleId}`
  );

  const query = new Parse.Query("Submodule");
  query.equalTo("moduleId", moduleId);
  query.equalTo("index", index);
  let submodule = await query.first();
  if (!submodule) {
    submodule = new Parse.Object("Submodule");
  }

  submodule.set("name", name);
  submodule.set("url", url);
  submodule.set("index", index);
  submodule.set("moduleId", moduleId);
  submodule = await submodule.save();

  return submodule.id;
});
