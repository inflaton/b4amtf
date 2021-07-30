const MASTER_KEY = { useMasterKey: true };

Parse.Cloud.define('import', async request => {
  const className = request.params.className;
  const rows = request.params.results;

  const MyClass = Parse.Object.extend(className);

  const myClassObjects = [];
  for (let i = 0; i < rows.length; i++) {
    const myClassObject = new MyClass();

    for (const column in rows[i]) {
      myClassObject.set(column, rows[i][column]);
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
