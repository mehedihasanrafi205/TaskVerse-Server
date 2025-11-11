const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const serviceAccount = require("./taskverse-firebase-admins.key.json");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const verifyFBToken = async (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res
      .status(401)
      .send({ message: "Unauthorized Access. Token not found" });
  }
  const token = authorization.split(" ")[1];

  try {
    await admin.auth().verifyIdToken(token);
    next();
  } catch (error) {
    res.status(401).send({ message: "Unauthorized Access" });
  }
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@desmondhart.tz893ku.mongodb.net/?appName=Desmondhart`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

app.get("/", (req, res) => {
  res.send("Server is running fine!");
});

async function run() {
  try {
    await client.connect();

    const db = client.db("TaskVerseDB");
    const jobColl = db.collection("jobs");
    const acceptedTasksColl = db.collection("accepted-tasks");

    app.get("/allJobs", async (req, res) => {
      const result = await jobColl.find().sort({ created_at: -1 }).toArray();
      res.send(result);
    });

    app.get("/latestJobs", async (req, res) => {
      const result = await jobColl
        .find()
        .sort({ created_at: -1 })
        .limit(6)
        .toArray();

      res.send(result);
    });

    app.get("/allJobs/:id", verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await jobColl.findOne(query);
      res.send(result);
    });

    app.get("/myAddedJobs", verifyFBToken, async (req, res) => {
      const email = req.query.email;
      const result = await jobColl
        .find({ postedByEmail: email })
        .sort({ created_at: -1 })
        .toArray();
      res.send(result);
    });

    app.post("/addJob", async (req, res) => {
      const data = req.body;
      const result = await jobColl.insertOne(data);
      res.send(result);
    });
    app.put("/updateJob/:id", verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const data = req.body;
      const query = { _id: new ObjectId(id) };
      const update = {
        $set: data,
      };
      const result = await jobColl.updateOne(query, update);
      res.send(result);
    });
    app.delete("/deleteJob/:id", verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      result = await jobColl.deleteOne(query);
      res.send(result);
    });

    app.get("/my-accepted-tasks", verifyFBToken, async (req, res) => {
      const email = req.query.email;
      const result = await acceptedTasksColl
        .find({ userEmail: email })
        .sort({ accepted_at: -1 })
        .toArray();
      res.send(result);
    });

    app.post("/my-accepted-tasks", verifyFBToken, async (req, res) => {
      const data = req.body;
      delete data._id;
      const result = await acceptedTasksColl.insertOne(data);
      res.send(result);
    });

    app.delete("/my-accepted-tasks/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      result = await acceptedTasksColl.deleteOne(query);
      res.send(result);
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
