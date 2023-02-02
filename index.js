const express = require("express");
const app = express();
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 5000;
require("dotenv").config();
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.STRIPE_KEY);

app.use(express.static("public"));

// middle wear
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("doctors portals server is running ..");
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.a31ucvz.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

// jwt function
function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  // console.log(authHeader);
  if (!authHeader) {
    return res.status(401).send("unauthorized access");
  }
  const token = authHeader.split(" ")[1];

  jwt.verify(token, process.env.TOKEN, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
}

async function run() {
  try {
    const appointmentOptionsCollection = client
      .db("doctorsPortal")
      .collection("appointmentOptions");
    const bookingsCollection = client
      .db("doctorsPortal")
      .collection("bookings");
    const usersCollection = client.db("doctorsPortal").collection("users");
    const doctorsCollection = client.db("doctorsPortal").collection("doctors");
    const paymentsCollection = client.db("doctorsPortal").collection("payments");

    // NOTE: make sure you use verifyAdmin after verifyJWT
    const verifyAdmin = async (req,res,next) => {
      //  console.log(req.decoded.email);
       const decodedEmail = req.decoded.email;
      const query = { email: decodedEmail };
      const user = await usersCollection.findOne(query);

      if (user?.role !== "admin") {
        return res.status(401).send({ message: "forbidden access" });
      };
       next();
    }

    // get appointment data from mongodb
    app.get("/appOptions", async (req, res) => {
      const date = req.query.date;

      // get all appointmentOptions from mongodb
      const query = {};
      const optionsCursor = appointmentOptionsCollection.find(query);
      const options = await optionsCursor.toArray();

      // get the booking of the provide date
      const bookingQuery = { appointmentDate: date };
      const alreadyBooked = await bookingsCollection
        .find(bookingQuery)
        .toArray();

      // customize data from optionsCollection
      options.forEach((option) => {
        const optionBooked = alreadyBooked.filter(
          (book) => book.yourTreatment === option.name
        );
        const bookedSlot = optionBooked.map((book) => book.slot);
        const remainingSlots = option.slots.filter(
          (slot) => !bookedSlot.includes(slot)
        );
        option.slots = remainingSlots;
        // console.log(option.name, remainingSlots.length);
      });

      res.send(options);
    });

    // appointment option name api
    app.get('/appOptionsName', async (req,res) => {
      const query = {};
      const result = await appointmentOptionsCollection.find(query).project({name:1}).toArray();
      res.send(result);
    });

    /***
     * API Naming Convention
     * app.get('/bookings')
     * app.get('/bookings/:id')
     * app.post('/bookings')
     * app.patch('/bookings/:id')
     * app.delete('/bookings/:id')
     */

    // dashboard email query
    app.get("/bookings", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const decodedEmail = req.decoded.email;
      // console.log(email)
      // console.log(req.headers.authorization)
      if (email !== decodedEmail) {
        return res.status(403).send({ message: "forbidden access" });
      };

      const query = { email: email };
      const booking = await bookingsCollection.find(query).toArray();
      res.send(booking);
    });

    // post from modal
    app.post("/bookings", async (req, res) => {
      const booking = req.body;
      // console.log(booking);
      const query = {
        appointmentDate: booking.appointmentDate,
        email: booking.email,
        yourTreatment: booking.yourTreatment,
      };
      const alreadyBooked = await bookingsCollection.find(query).toArray();
      if (alreadyBooked.length) {
        const message = `you already booking on ${booking.yourTreatment}`;
        return res.send({ acknowledge: false, message });
      }
      const result = await bookingsCollection.insertOne(booking);
      res.send(result);
    });

    // payment option 
    app.get('/bookings/:id', async (req,res) => {
      const id = req.params.id;
      const query = {_id: ObjectId(id)};
      const result = await bookingsCollection.findOne(query);
      res.send(result);
    });

    // payment intention
    app.post('/create-payment-intent', async (req,res) => {
      const booking = req.body;
      const price = booking.price;
      const amount = price * 100;

      
      const paymentIntent = await stripe.paymentIntents.create({
        currency: "usd",
        amount,
        "payment_method_types": [
          "card"
        ],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // payment post 
    app.post('/payment', async (req,res) => {
      const payment = req.body;
      const result = await paymentsCollection.insertOne(payment);

      const id = payment.bookingId
            const filter = {_id: ObjectId(id)}
            const updatedDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId
                }
            }
            const updatedResult = await bookingsCollection.updateOne(filter, updatedDoc)

      res.send(result);
    })

    // JWT
    app.get("/jwt", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user) {
        const token = jwt.sign({ email }, process.env.TOKEN, {
          expiresIn: "2h",
        });
        return res.send({ accessToken: token });
      }
      res.status(403).send({ accessToken: "" });
    });

    // post from sign up
    app.post("/users", async (req, res) => {
      const user = req.body;
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // all user api get
    app.get("/users", async (req, res) => {
      const query = {};
      const result = await usersCollection.find(query).toArray();
      res.send(result);
    });

    // appointment payment options
    // app.get('')

    // update and make Admin role
    app.put("/users/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await usersCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.send(result);
    });

    // update price in mongoDB
    // app.get('/addPrice' , async(req,res) => {
    //   const filter = {};
    //   const option = {upsert : true};
    //   const updateDoc = {
    //     $set: {
    //       price : 99
    //     }
    //   };
    //   const result = await appointmentOptionsCollection.updateMany(filter,updateDoc,option);
    //   res.send(result);
    // });

    // get admin using email
    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      // console.log(user,email)
      res.send({ isAdmin: user?.role === 'admin' });
    });

    // post doctor 
    app.post('/doctors', verifyJWT,verifyAdmin, async (req, res) => {
      const doctor = req.body;
      const result = await doctorsCollection.insertOne(doctor);
      res.send(result);
    });

    // get all doctors api
    app.get('/doctors', verifyJWT,verifyAdmin, async (req,res) => {
      const query = {};
      const doctors = await doctorsCollection.find(query).toArray();
      res.send(doctors);
    });

    // delete doctor api
    app.delete('/doctors/:id', verifyJWT,verifyAdmin, async (req,res) => {
      const id = req.params.id;
      const query = {_id: ObjectId(id)};
      const result = await doctorsCollection.deleteOne(query);
      res.send(result);
      // console.log(result);
    });

  } finally {
  }
}
run().catch((error) => console.log(error));

app.listen(port, () => {
  console.log(`doctors portal is running port ${port}`);
});
