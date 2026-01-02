const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const port = process.env.PORT || 3000;

// Firebase Setup
const decoded = Buffer.from(
  process.env.FIREBASE_SERVICE_KEY,
  "base64"
).toString("utf8");
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Middleware
app.use(cors());
app.use(express.json());

// Auth Middleware
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
    // await client.connect();

    const db = client.db("TaskVerseDB");
    const jobColl = db.collection("jobs");
    const acceptedTasksColl = db.collection("accepted-tasks");

    // ---------------------------------------------------------
    // Job Management APIs (Search, Filter, Sort, Pagination)
    // ---------------------------------------------------------

    app.get("/allJobs", async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;
        const search = req.query.search || "";
        const sort = req.query.sort || "newest"; // newest, oldest, price_asc, price_desc
        const category = req.query.category || "";
        const minPrice = parseFloat(req.query.minPrice);
        const maxPrice = parseFloat(req.query.maxPrice);

        const skip = (page - 1) * limit;

        // Query Construction
        const query = {
          $or: [
            { title: { $regex: search, $options: "i" } },
            { description: { $regex: search, $options: "i" } },
          ],
        };

        if (category) {
          query.category = category;
        }

        if (!isNaN(minPrice) && !isNaN(maxPrice)) {
          query.price = { $gte: minPrice, $lte: maxPrice };
        } else if (!isNaN(minPrice)) {
          query.price = { $gte: minPrice };
        } else if (!isNaN(maxPrice)) {
          query.price = { $lte: maxPrice };
        }

        // Sorting Logic
        let sortQuery = {};
        if (sort === "newest") sortQuery = { created_at: -1 };
        else if (sort === "oldest") sortQuery = { created_at: 1 };
        else if (sort === "price_asc") sortQuery = { price: 1 };
        else if (sort === "price_desc") sortQuery = { price: -1 };

        const result = await jobColl
          .find(query)
          .sort(sortQuery)
          .skip(skip)
          .limit(limit)
          .toArray();

        const totalCount = await jobColl.countDocuments(query);

        res.send({ jobs: result, totalCount });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Error fetching jobs" });
      }
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

    // ---------------------------------------------------------
    // Accepted Tasks / Bids APIs
    // ---------------------------------------------------------

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

    // ---------------------------------------------------------
    // Dashboard Stats API
    // ---------------------------------------------------------

    app.get("/stats", verifyFBToken, async (req, res) => {
      try {
        const email = req.query.email;
        
        // Parallel execution for performance
        const [postedJobsCount, acceptedTasksCount, totalJobsCount] = await Promise.all([
          jobColl.countDocuments({ postedByEmail: email }),
          acceptedTasksColl.countDocuments({ userEmail: email }),
          jobColl.estimatedDocumentCount()
        ]);

        res.send({
          postedJobs: postedJobsCount,
          acceptedTasks: acceptedTasksCount, 
          totalPlatformJobs: totalJobsCount,
          pendingBids: 0 
        });

      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Error fetching stats" });
      }
    });

    // await client.db("admin").command({ ping: 1 });
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
