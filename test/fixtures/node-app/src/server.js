const express = require("express");
const helper = require("./lib/helper");

const app = express();
app.listen(3000, () => helper());
