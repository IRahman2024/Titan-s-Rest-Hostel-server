const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express');
const cors = require('cors');
const app = express();
const jwt = require('jsonwebtoken');
require('dotenv').config()
const port = 5000 || process.env.PORT;
const stripe = require("stripe")(process.env.STRIPE_KEY);

// console.log(process.env.STRIPE_KEY);
//middleware
app.use(cors({
    origin: [
        "https://titan-s-rest.web.app",
        "https://titan-s-rest.firebaseapp.com",
        "http://localhost:5173",
        "http://localhost:5174"
    ]
}));
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.8sux4by.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {



        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();
        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");



        const secret = process.env.ACCESS_TOKEN_SECRET;
        // console.log(secret);
        const userCollection = client.db("TitansDb").collection("users");
        const mealsCollection = client.db("TitansDb").collection("meals");
        const reviewsCollection = client.db("TitansDb").collection("reviews");
        const requestCollection = client.db("TitansDb").collection("requests");
        // const cartsCollection = client.db("TitansDb").collection("carts");
        const paymentCollection = client.db("TitansDb").collection("payments");

        //middlewares
        const verifyToken = (req, res, next) => {
            // console.log('inside verify token', req.headers.authorization);
            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'unauthorized access' });
            }
            const token = req.headers.authorization;
            jwt.verify(token, secret, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'unauthorized access' });
                }
                req.decoded = decoded;
                next();
            });
        }
        //use verify admin after verifyToken
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const isAdmin = user?.role === 'admin';
            if (!isAdmin) {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next();
        }

        //jwt api
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, secret, { expiresIn: '1h' })
            res.send({ token })
        })

        //payment  api
        app.get('/payments/:email', verifyToken, async (req, res) => {
            const query = { email: req.params.email };
            if (req.params.email !== req.decoded.email) {
                return res.status(403).send({ message: 'forbidden access' })
            }
            const result = await paymentCollection.find(query).toArray();
            res.send(result);
        })

        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);
            // console.log(amount, 'amount from inside');

            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });

            res.send({
                clientSecret: paymentIntent.client_secret
            })
        })
        //save user payment history
        app.post('/payments', async (req, res) => {
            const payment = req.body;
            const paymentResult = await paymentCollection.insertOne(payment);

            //carefully delete each item from cart of that specific user

            // console.log('payment info', payment);
            res.send({ paymentResult });
        })

        //meals api
        app.get('/meals', async (req, res) => {
            // console.log(req.headers);
            const { name, category, range } = req.query;
            const price = parseInt(range);
            // console.log('searched from query', category);
            const query = {
                status: { $eq: 'available' },
            }
            if (name && typeof name === 'string') {
                query.name = { $regex: name, $options: "i" };
            }
            if (category && typeof category === 'string') {
                query.category = category;
            }
            if (range) {
                query.price = { $gte: price };
            }
            // console.log(typeof(price));
            const cursor = mealsCollection.find(query);
            const result = await cursor.toArray();
            // console.log(result);
            res.send(result);
        })

        app.post('/meals', verifyToken, verifyAdmin, async (req, res) => {
            console.log(req);
            const item = req.body;
            const result = await mealsCollection.insertOne(item);
            res.send(result);
        })

        app.get('/meals/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await mealsCollection.findOne(query);
            res.send(result);
        })

        app.patch('/meals/:id', verifyToken, verifyAdmin, async (req, res) => {
            const item = req.body;
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    name: item.name,
                    category: item.category,
                    price: item.price,
                    image: item.image
                }
            }
            const result = await mealsCollection.updateOne(filter, updateDoc);
            res.send(result);
        })

        app.delete('/meals/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await mealsCollection.deleteOne(query);
            res.send(result);
        })

        //meal request api
        app.post('/request', verifyToken, async (req, res) => {
            const request = req.body;
            console.log(request);
            const result = await requestCollection.insertOne(request);
            res.send(result);
            })
            
        //todo: requested chaged to served
        app.patch('/request/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    status: 'served'
                }
            }
            const result = await mealsCollection.updateOne(filter, updateDoc);
            res.send(result);
        })

        //review api
        app.get('/reviews', async (req, res) => {
            const result = await reviewsCollection.find().toArray();
            res.send(result);
        })

        app.get('/reviews/:id', async (req, res) => {
            const id = req.params.id;
            const query = { mealId: id };
            const result = await mealsCollection.findOne(query);
            res.send(result);
        })

        app.post('/reviews', verifyToken, async (req, res) => {
            const review = req.body;
            // console.log(review);
            const result = await reviewsCollection.insertOne(review);
            res.send(result);
        })

        //user apis
        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result);
        })

        app.get('/users/:email', async (req, res) => {
            const email = req.params.email;

            const query = { email: email };
            const user = await userCollection.findOne(query);
            res.send(user);
        })

        app.put('/users/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            const about = req.body;

            const filter = { email: email };
            const options = { upsert: true };

            console.log(about);

            if (about.package) {
                const updatedDoc = {
                    $set: {
                        badge: about.package
                    }
                };
                const user = await userCollection.updateOne(filter, updatedDoc, options);
                res.send(user);
            }

            else {
                const updatedDoc = {
                    $set: {
                        about: about
                    }
                };
                const user = await userCollection.updateOne(filter, updatedDoc, options);
                res.send(user);
            }


        })

        //checks if it's admin or not
        app.get('/users/admin/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            // console.log('decoded email:', req.decoded.email);
            //checks if requested email and user email matches or not
            if (email !== req.decoded.email) {
                return res.status(403).send({ message: 'forbidden access' })
            }

            const query = { email: email };
            const user = await userCollection.findOne(query);

            //checks if email owner is admin or not
            let admin = false;
            if (user) {
                admin = user?.role === 'admin';
            }
            res.send({ admin })
        })

        app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await userCollection.updateOne(filter, updatedDoc)
        })

        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email };
            const existingUser = await userCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: 'user already exists!', insertedId: null });
            }
            const result = await userCollection.insertOne(user);
            res.send(result);
        })

        app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await userCollection.deleteOne(query);
            res.send(result);
        })


    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);



app.get('/', (req, res) => {
    res.send('Titan is running')
})

app.listen(port, () => {
    console.log('Titan is taking a nap on port', port);
})