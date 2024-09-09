const express  = require("express");
const socket = require("socket.io");
const http = require("http");
const { Chess } = require("chess.js");
const path = require("path");
const { title } = require("process");
const app = express();
const server = http.createServer(app);
const io = socket(server);
const { v4: uuidv4 } = require('uuid');

const chess = new Chess();
let players = {};
let currentPlayer = "w";

app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
    res.render("index", {title: "Chess game"});
})

app.get("/create-game", (req, res) => {
    const gameId = uuidv4();  // Generate a unique ID
    players[gameId] = { white: null, black: null, spectators: [] };
    res.redirect(`/game/${gameId}`);
});

// Route to handle game joining
app.get("/join-game", (req, res) => {
    const gameId = req.query.gameId;  // Get gameId from form input
    if (!players[gameId]) {
        return res.send("Invalid Game ID. Please check and try again.");
    }
    res.redirect(`/game/${gameId}`);
});

app.get("/game/:gameId", (req, res) => {
    const gameId = req.params.gameId;
    if (!players[gameId]) {
        return res.send("Invalid Game ID.");
    }

    res.render("game", { gameId: gameId });
});

io.on("connection", function (uniqueSocket) {
    console.log("connected");

    if (!players.white) {
        players.white = uniqueSocket.id;
        uniqueSocket.emit("playerRole", "w");
    }
    else if (!players.black) {
        players.black = uniqueSocket.id;
        uniqueSocket.emit("playerRole", "b");
    }
    else {
        uniqueSocket.emit("spectatorRole");
    }

    uniqueSocket.on("disconnect", function () {
        if (uniqueSocket.id === players.white) {
            delete players.white;
        }
        else if (uniqueSocket.id === players.black) {
            delete players.black;
        }
    })

    uniqueSocket.on("move", (move)=>{
        try {
            if (chess.turn() === "w" && uniqueSocket.id !== players.white) return;
            if (chess.turn() === "b" && uniqueSocket.id !== players.black) return;

            const result = chess.move(move);
            if (result) {
                currentPlayer = chess.turn();
                io.emit("move", move);
                io.emit("boardState", chess.fen());
            }
            else {
                console.log("Invalid Move: ", move);
                uniqueSocket.emit("invalidMove", move);
            }
        } catch (error) {
            console.log(error);
            uniqueSocket.emit("Invalid Move: ", move);
        }
    })
})
server.listen(3000, function () {
    console.log("listening on port 3000")
});