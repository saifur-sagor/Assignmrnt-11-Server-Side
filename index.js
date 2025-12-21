const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 5000;
// stipe
const stripe = require("stripe")(process.env.STRIPE_SECRET);

// firebase admin key
const admin = require("firebase-admin");
// const serviceAccount = require("./book_courier.json");
// decode;
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf8"
);
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// verifyFBToken MiddleWare
const verifyFBToken = async (req, res, next) => {
  const token = req.headers.authorization;
  // console.log("headers", token);
  if (!token) {
    return res.status(401).send({ message: "Unauthorized access1" });
  }
  try {
    const tokenId = token.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(tokenId);
    // console.log("decoded in the token", decoded);
    req.decoded_email = decoded.email;
    next();
  } catch (error) {
    return res.status(401).send({ message: "unauthorized access2" });
  }
};
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
    // await client.connect();

    // All Collection
    const database = client.db("book_courier");
    const usersCollection = database.collection("users");
    const booksCollection = database.collection("books");
    const ordersCollection = database.collection("orders");
    const orderedBooksCollection = database.collection("orderedBooks");

    // user get
    app.get("/users", async (req, res) => {
      const searchText = req.query.searchText;
      const query = {};
      if (searchText) {
        // query.displayName = searchText;
        // query.displayName = { $regex: searchText, $options: "i" };
        query.$or = [
          { displayName: { $regex: searchText, $options: "i" } },
          { email: { $regex: searchText, $options: "i" } },
        ];
      }
      const cursor = usersCollection
        .find(query)
        .sort({ createdAt: -1 })
        .limit(5);
      const result = await cursor.toArray();
      res.send(result);
    });
    // user create
    app.post("/users", async (req, res) => {
      const user = req.body;
      user.role = "user";
      user.createdAt = new Date();

      const email = user.email;
      const userExists = await usersCollection.findOne({ email });
      if (userExists) {
        return res.send({ message: "already user exists" });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });
    // user role update
    app.patch("/users/:id/role", async (req, res) => {
      const id = req.params.id;
      const roleInfo = req.body;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: roleInfo.role,
        },
      };
      const result = await usersCollection.updateOne(query, updateDoc);
      res.send(result);
    });
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
    // Get single book by id
    app.get("/books/:id", async (req, res) => {
      const { id } = req.params;
      const book = await booksCollection.findOne({ _id: new ObjectId(id) });
      if (!book) {
        return res.status(404).send({ error: "Book not found" });
      }
      res.send(book);
    });

    // book post
    app.post("/books", async (req, res) => {
      const book = req.body;
      //created time
      book.createdAt = new Date();
      const result = await booksCollection.insertOne(book);
      res.send(result);
    });
    // Get my books by email
    app.get("/my-books", verifyFBToken, async (req, res) => {
      const email = req.query.email;

      if (!email) {
        return res.status(400).send({ message: "Email is required" });
      }

      const query = { email: email };
      const result = await booksCollection.find(query).toArray();

      res.send(result);
    });
    // update book (PATCH)
    app.patch("/books/:id", verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const updatedBook = req.body;

      const filter = { _id: new ObjectId(id) };

      const updateDoc = {
        $set: {
          name: updatedBook.name,
          author: updatedBook.author,
          image: updatedBook.image,
          status: updatedBook.status,
          price: updatedBook.price,
          description: updatedBook.description,
          updatedAt: new Date(),
        },
      };

      const result = await booksCollection.updateOne(filter, updateDoc);

      res.send(result);
    });

    // place order
    app.post("/orders", async (req, res) => {
      const order = req.body;
      order.createdAt = new Date();
      order.status = "pending";
      order.paymentStatus = "unpaid";
      const result = await ordersCollection.insertOne(order);
      res.send(result);
    });

    // ordered book info
    app.post("/ordered-books", async (req, res) => {
      const orderedBook = req.body;
      orderedBook.createdAt = new Date();
      const result = await orderedBooksCollection.insertOne(orderedBook);
      res.send(result);
    });
    // get my orders by user email
    app.get("/orders", async (req, res) => {
      const email = req.query.email;
      const status = req.query.status;

      if (!email) {
        return res.send([]);
      }
      const query = { userEmail: email };
      if (status) {
        query.status = status;
      }

      const orders = await ordersCollection
        .find(query)
        .sort({ createdAt: -1 })
        .toArray();

      res.send(orders);
    });

    // cancel order
    app.patch("/orders/cancel/:id", async (req, res) => {
      const id = req.params.id;

      const result = await ordersCollection.updateOne(
        { _id: new ObjectId(id), status: "pending" },
        {
          $set: {
            status: "cancelled",
          },
        }
      );

      res.send(result);
    });
    // librarian-orders
    app.get("/librarian-orders", async (req, res) => {
      const ownerEmail = req.query.email;

      if (!ownerEmail) {
        return res.status(400).send({ error: "Owner email required" });
      }
      const orders = await orderedBooksCollection
        .find({ ownerEmail })
        .sort({ createdAt: -1 })
        .toArray();

      res.send(orders);
    });
    // PATCH librarian-orders/cancel/:id
    app.patch("/librarian-orders/cancel/:id", async (req, res) => {
      const id = req.params.id;
      const result = await ordersCollection.updateOne(
        { _id: new ObjectId(id), status: "pending" },
        { $set: { status: "cancelled" } }
      );

      if (result.modifiedCount === 0) {
        return res
          .status(400)
          .send({ success: false, message: "Cannot cancel this order" });
      }
      res.send({ success: true, message: "Order cancelled successfully" });
    });

    // payment related api
    app.post("/create-checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      const amount = parseInt(paymentInfo.bookPrice) * 100;
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "BDT",
              unit_amount: amount,
              product_data: {
                name: paymentInfo.bookName,
              },
            },
            quantity: 1,
          },
        ],
        customer_email: paymentInfo.userEmail,
        mode: "payment",
        metadata: {
          bookId: paymentInfo.bookId,
        },
        success_url: `${process.env.SITE_DOMAIN}/dashBoard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashBoard/payment-cancelled`,
      });
      res.send({ url: session.url });
    });
    // PATCH
    app.patch("/orders/paid/:id", async (req, res) => {
      const { id } = req.params;
      const { transactionId } = req.body;

      try {
        const paidAt = new Date(); // Payment সময়
        const result = await ordersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: "paid", transactionId, paidAt } }
        );

        res.send({
          success: true,
          message: "Order updated to paid",
          transactionId,
        });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });
    // stripe session
    app.get("/stripe-session/:id", async (req, res) => {
      const sessionId = req.params.id;

      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const orderId = session.metadata.bookId;
      // transactionId
      const transactionId = session.payment_intent;
      // status update
      await ordersCollection.updateOne(
        { _id: new ObjectId(orderId) },
        { $set: { status: "paid", transactionId, paidAt: new Date() } }
      );
      res.send({ orderId, transactionId });
      res.status(500).send({ error: "error" });
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
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
