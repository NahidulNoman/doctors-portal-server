const express = require("express");
const app = express();
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");
const port = process.env.PORT || 5000;
require("dotenv").config();

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

async function run() {
  try {
    const appointmentOptionsCollection = client
      .db("doctorsPortal")
      .collection("appointmentOptions");
    const bookingsCollection = client
      .db("doctorsPortal")
      .collection("bookings");

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
        const optionBooked = alreadyBooked.filter(book => book.yourTreatment === option.name);
        const bookedSlot = optionBooked.map(book => book.slot)
        const remainingSlots = option.slots.filter(slot => !bookedSlot.includes(slot));
        option.slots = remainingSlots
        console.log( option.name,remainingSlots.length)
      });

      res.send(options);
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
    app.get('/bookings', async (req,res) => {
      const email = req.query.email;
      console.log(email)
      const query = {email: email};
      const booking = await bookingsCollection.find(query).toArray();
      res.send(booking);
    });

    // post from modal
    app.post("/bookings", async (req, res) => {
      const booking = req.body;
      console.log(booking);
      const query = {
        appointmentDate : booking.appointmentDate,
        email : booking.email,
        yourTreatment : booking.yourTreatment
      };
      const alreadyBooked = await bookingsCollection.find(query).toArray();
      if(alreadyBooked.length){
        const message = `you already booking on ${booking.yourTreatment}`
        return res.send({acknowledge : false , message})
      }
      const result = await bookingsCollection.insertOne(booking);
      res.send(result);
    });

  } finally {
  }
}
run().catch((error) => console.log(error));

app.listen(port, () => {
  console.log(`doctors portal is running port ${port}`);
});