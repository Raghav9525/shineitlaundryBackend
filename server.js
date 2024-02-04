const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 5000;

const deliveryRoutes = require('./routes/delivery')

app.use(express.json());
app.use(cors({
    origin: "*" // Allow all origins
}));

app.use('/',deliveryRoutes);


app.listen(PORT, () => {
    console.log(`Server running on ${PORT}`);
});
