const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { parse } = require("dotenv");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://flavor-fusion-bysam.web.app",
      "https://flavor-fusion-bysam.firebaseapp.com",
    ],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// JWT Middleware
const logger = (req, res, next) => {
  console.log("log info", req.method, req.url);
  next();
}

const verifyToken = (req, res, next) => {
  const token  = req.cookies?.token;
  console.log("token in middleware ",token);
  if(!token){
    res.status(401).json({message: "Unauthorised Access"});
    return;
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if(err){
      res.status(401).json({message: "Unauthorised Access"});
      return;
    }
    req.user = decoded;
    next();
  });
};

// routes
app.get("/", (req, res) => {
  res.send("Flavor Fusion server is running");
});

// listening port
app.listen(port, () => {
  console.log("Flavor Fusion server is listening on port " + port);
});

// mongoDB
const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@cluster0.wu8kmms.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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
    // create a new database collection

    // Foods Collection
    const foodCollection = client.db("flavorFusionDB").collection("storedFood");
    // user Collection
    const userCollection = client.db("flavorFusionDB").collection("users");
    // order Collection
    const orderCollection = client.db("flavorFusionDB").collection("orders");
    // Photo Collection
    const photoCollection = client.db("flavorFusionDB").collection("photos");

    // API Calls

    // Auth Related API Calls
    // creating token
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      console.log("user for token", user);
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: true,
          sameSite: "none",
        })
        .send({ success: true });
    });

    //clearing Token
    app.post("/logout", async (req, res) => {
      const user = req.body;
      console.log("logging out", user);
      res
        .clearCookie("token", { maxAge: 0 })
        .send({ success: true });
    });

    // Stored Food Collection API calls
    // calling all stored foods
    app.get("/storedFood", async (req, res) => {
      const foods = await foodCollection.find().toArray();
      res.send(foods);
    });

    // adding a food to stored food collection
    app.post("/storedFood", async (req, res) => {
      const newFood = req.body;

      // Convert Quantity, TotalRatingCount and PurchaseCount to int32
      newFood.Quantity = parseInt(newFood.Quantity);
      newFood.PurchageCount = parseInt(newFood.PurchageCount);
      newFood.TotalRatingCount = parseInt(newFood.TotalRatingCount);

      // Convert Price & TotalRating to double
      newFood.Price = parseFloat(newFood.Price);
      
      newFood.TotalRating = parseInt(newFood.TotalRating);

      console.log("new food", newFood);
      const result = await foodCollection.insertOne(newFood);
      res.send(result);
    });

    // Patching food rating
    app.patch('/storedFood/:foodName', async (req, res) => {
      const { foodName } = req.params;
      const { rating } = req.body;
  
      try {
          // Find the document by food name to get its ObjectId
          const document = await foodCollection.findOne({ FoodName: foodName });
          if (!document) {
              return res.status(404).send('Food item not found');
          }
  
          const objectId = document._id;
          const totalRatingCount = document.TotalRatingCount || 0;
          const totalRating = document.TotalRating || 0;
          
          // Calculate the new average rating
          const newTotalRatingCount = totalRatingCount + 1;
          const newTotalRating = totalRating + parseFloat(rating);
          const newAverageRating = parseFloat(newTotalRating / newTotalRatingCount);
  
          // Update the document using its ObjectId
          const result = await foodCollection.updateOne(
              { _id: objectId },
              { $set: { 
                  TotalRating: newTotalRating,
                  TotalRatingCount: newTotalRatingCount,
                  AverageRating: newAverageRating 
              }}
          );
  
          res.json(result);
      } catch (error) {
          res.status(500).send(error.message);
      }
  });

    // calling stored foods based on same email address
    app.get("/storedFood/:email",logger, verifyToken, async (req, res) => {
      console.log("Toke owner Info ", req.user);
      const email = req.params.email;
      if(req.user.email !== email){
        return res.status(403).send({message: "forbidden access" })
      }
      const query = { AddedByEmail: email };
      const foods = await foodCollection.find(query).toArray();
      res.send(foods);
    });

    // Calling stored foods based on purchase count
    app.get("/topFoods", async (req, res) => {
      const foods = await foodCollection
        .find()
        .sort({ PurchageCount: -1 })
        .limit(6)
        .toArray();
      res.send(foods);
    });

    // calling a single food based on id
    app.get("/storedFood/food/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const food = await foodCollection.findOne(query);
      res.send(food);
    });

    // increasing purchase count of a food

    app.patch("/storedFood/foodCount/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const food = await foodCollection.findOne(query);
      const PurchageCount = req.body.PurchageCount;
      console.log("data for increasing count", PurchageCount);
      food.PurchageCount =
        parseInt(food.PurchageCount) + parseInt(PurchageCount);
      food.Quantity = parseInt(food.Quantity) - parseInt(PurchageCount);
      const result = await foodCollection.updateOne(query, {
        $set: { PurchageCount: food.PurchageCount, Quantity: food.Quantity },
      });
      res.send(result);
    });

    // Update a food data
    app.patch("/storedFood/food/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const food = await foodCollection.findOne(query);
      const newFood = req.body;
      console.log(newFood);
      const result = await foodCollection.updateOne(query, {
        $set: newFood,
      });
      res.send(result);
    });

    // user related API calls
    // sending user data to DB
    app.post("/user", async (req, res) => {
      const newUser = req.body;
      console.log(newUser);
      const result = await userCollection.insertOne(newUser);
      res.send(result);
    });

    // get all users
    app.get("/users", async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    });

    // Order Related API calls
    // Getting All orders data
    // app.get("/orders", async (req, res) => {
    //   const orders = await orderCollection.find().toArray();
    //   res.send(orders);
    // });

    // getting order data from same email address
    app.get("/orders/:email",logger, verifyToken, async (req, res) => {
      console.log("Toke owner Info ", req.user);
      const email = req.params.email;
      if(req.user.email !== email){
        return res.status(403).send({message: "forbidden access" })
      }
      const query = { BuyerEmail: email };
      const orders = await orderCollection.find(query).toArray();
      res.send(orders);
    });

    // delete one order data
    app.delete("/orders/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await orderCollection.deleteOne(query);
      res.send(result);
    });

    // Sending Order data to DB
    app.post("/order", async (req, res) => {
      const newOrder = req.body;
      console.log(newOrder);
      const result = await orderCollection.insertOne(newOrder);
      res.send(result);
    });

    // Photo Related API calls
    // calling all photos api
    app.get("/photos", async (req, res) => {
      const photos = await photoCollection.find().toArray();
      res.send(photos);
    });

    // sending Photo data to db
    app.post("/photo", async (req, res) => {
      const newPhoto = req.body;
      console.log(newPhoto);
      const result = await photoCollection.insertOne(newPhoto);
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
