const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion, Collection } = require("mongodb");
const port = process.env.PORT || 5000;

// middleware
app.use(express.json());
app.use(cors());

// mongoUri
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ukfyacf.mongodb.net/?appName=Cluster0`;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    // All Collection
    const database = client.db("book_courier");
    const booksCollection = database.collection("books");

    // Get latest books
    app.get("/books/latest", async (req, res) => {
      const books = await booksCollection
        .find()
        .sort({ createdAt: -1 })
        .limit(6)
        .toArray();
      res.send(books);
    });
    // get all books
    app.get("/books", async (req, res) => {
      try {
        const books = await booksCollection.find().toArray();
        res.send(books);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to fetch books" });
      }
    });

    // book post
    app.post("/books", async (req, res) => {
      const book = req.body;
      //created time
      book.createdAt = new Date();
      const result = await booksCollection.insertOne(book);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Book Courier!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
