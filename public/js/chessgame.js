const socket = io();
const chess = new Chess();
const boardElement = document.querySelector(".chessboard");

const playButton = document.querySelector("#play-button");
const inviteButton = document.querySelector("#invite-button");
const challengeButton = document.querySelector("#challenge-button");
const spectatorButton = document.querySelector("#spectator-button");
const challengePopup = document.querySelector("#challenge-popup");
const acceptButton = document.querySelector("#accept-challenge");
const rejectButton = document.querySelector("#reject-challenge");

let draggedPiece = null;
let sourceSquare = null;
let playerRole = null;
let gameStarted = false;
let currentChallengerId = null;
let currentChallengerName = null;

inviteButton.addEventListener("click", () => {
    const gameIdText = document.getElementById('gameIdText').textContent;
    navigator.clipboard.writeText(gameIdText).then(() => {
        showNotification("Link is copied!");
    }).catch(err => {
        console.error('Failed to copy Game ID', err);
    });
});
playButton.addEventListener("click", () => {
    socket.emit("startGame", gameId);
});
spectatorButton.addEventListener("click", () => {
    const playerName = document.getElementById('playerName').textContent;
    console.log(playerName);
    playerRole = "spectator";
    socket.emit("joinAsSpectator", gameId, playerName);
    updateUI();
});
challengeButton.addEventListener("click", () => {
    const playerName = document.getElementById('playerName').textContent;
    console.log(socket.id, " is challenging to white in ", gameId);
    socket.emit("challengeWhitePlayer", gameId, playerName);
});
acceptButton.addEventListener("click", () => {
    if (currentChallengerId && currentChallengerName) {
        socket.emit("acceptChallenge", gameId, currentChallengerId, currentChallengerName);
        console.log("Challenge accepted.");
    }
    hideChallengePopup();
});
rejectButton.addEventListener("click", () => {
    if (currentChallengerId) {
        socket.emit("rejectChallenge", currentChallengerId);
        console.log("Challenge rejected.");
    }
    hideChallengePopup();
});

const renderBoard = () => {
    const board = chess.board();
    boardElement.innerHTML = "";
    board.forEach((row, rowIndex) => {
        row.forEach((square, squareIndex) => {
            const squareElement = document.createElement("div");
            squareElement.classList.add("square",
                (rowIndex + squareIndex) % 2 === 0 ? "light" : "dark");
            squareElement.dataset.row = rowIndex;
            squareElement.dataset.col = squareIndex;

            if (square) {
                const pieceElement = document.createElement("div");
                pieceElement.classList.add("piece", square.color === "w" ? "white" : "black");
                pieceElement.innerText = getPieceUnicode(square);
                pieceElement.draggable = playerRole === square.color;

                pieceElement.addEventListener("dragstart", (e) => {
                    if (pieceElement.draggable) {
                        draggedPiece = pieceElement;
                        sourceSquare = { row: rowIndex, col: squareIndex };
                        e.dataTransfer.setData("text/plain", "");
                    }
                });
                pieceElement.addEventListener("dragend", () => {
                    draggedPiece = null;
                    sourceSquare = null;
                });
                squareElement.appendChild(pieceElement);
            }
            squareElement.addEventListener("dragover", function (e) {
                e.preventDefault();
            });
            squareElement.addEventListener("drop", function (e) {
                e.preventDefault();
                if (draggedPiece) {
                    const targetSource = {
                        row: parseInt(squareElement.dataset.row),
                        col: parseInt(squareElement.dataset.col)
                    };
                    handleMove(sourceSquare, targetSource);
                }
            });
            boardElement.appendChild(squareElement);
        });
    });
    if (playerRole === "b") {
        boardElement.classList.add("flipped");
    } else {
        boardElement.classList.remove("flipped");
    }
};
const handleMove = (source, target) => {
    const move = {
        from: `${String.fromCharCode(97 + source.col)}${8 - source.row}`,
        to: `${String.fromCharCode(97 + target.col)}${8 - target.row}`,
        promotion: "q",
        color: chess.turn() === 'w' ? 'w' : 'b'
    };
    if (gameStarted) {
        socket.emit("move", move, gameId);
    }
};
const getPieceUnicode = (piece) => {
    const unicodePieces = {
        'p': '\u2659', 'r': '\u2656', 'n': '\u2658', 'b': '\u2657',
        'q': '\u2655', 'k': '\u2654', 'P': '\u265F', 'R': '\u265C',
        'N': '\u265E', 'B': '\u265D', 'Q': '\u265B', 'K': '\u265A'
    };
    return unicodePieces[piece.type] || "";
};
const updateUI = () => {
    hideAllButtons();
    if (playerRole === "w" && !gameStarted) {
        playButton.style.display = "block";
        inviteButton.style.display = "block";
    } else if (!gameStarted && !playerRole) {
        spectatorButton.style.display = "block";
        challengeButton.style.display = "block";
    } else if (gameStarted && !playerRole) {
        spectatorButton.style.display = "block";
    }
};
const hideAllButtons = () => {
    playButton.style.display = "none";
    inviteButton.style.display = "none";
    challengeButton.style.display = "none";
    spectatorButton.style.display = "none";
    challengePopup.style.display = "none";
};
const showNotification = (message) => {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.style.display = 'block';
    setTimeout(() => {
        notification.style.display = 'none';
    }, 1000);
}
const showNoBlackPlayerPopup = () => {
    const popup = document.getElementById('noBlackPlayerPopup');
    popup.style.display = 'block';
    setTimeout(() => {
        popup.style.display = 'none';
    }, 1000);
}
const showChallengePopup = (challengerName) => {
    const popup = document.getElementById("challenge-popup");
    popup.style.display = "block";
    const challengeMessage = document.getElementById("challengeMessage");
    challengeMessage.textContent = `${challengerName} has challenged you! Do you accept?`;
}
const hideChallengePopup = () => {
    const popup = document.getElementById("challenge-popup");
    popup.style.display = "none"; 
}
const addMessageToBox = (message) => {
    if (playerRole !== null) {
        const messageBox = document.getElementById('messageBox');
        const messageElement = document.createElement('div');
        messageElement.classList.add('message');
        messageElement.textContent = message;
        messageBox.appendChild(messageElement);
        messageBox.scrollTop = messageBox.scrollHeight;
    }
}
const updateMoveHistory = (move) => {
    if (playerRole !== null) {
        const moveHistoryList = document.getElementById('moveHistoryList');
        const li = document.createElement('li');
        li.textContent = `${move.color === 'w' ? 'White' : 'Black'}: ${move.from} to ${move.to}`;
        moveHistoryList.appendChild(li);
        document.getElementById('moveHistoryBox').scrollTop = moveHistoryList.scrollHeight;
    }
}
socket.on("playerRole", function (role) {
    playerRole = role;
    console.log(playerRole, gameStarted);
    updateUI();
    renderBoard();
});
socket.on("boardState", function (fen) {
    if (playerRole !== null) {
        chess.load(fen);
        renderBoard();
    }
});
socket.on("move", function (move) {
    if (gameStarted && playerRole !== null) {
        updateMoveHistory(move);
        chess.move(move);
        renderBoard();
    }
});
socket.on("gameStarted", function () {
    gameStarted = true;
    updateUI();
    if (playerRole !== null) {
        renderBoard();
    }
});
socket.on("challengeRequest", function (challengerId, challengerName) {
    console.log("challenge recieved from ", challengerId, " to ", socket.id);
    currentChallengerId = challengerId;
    currentChallengerName = challengerName;
    showChallengePopup(challengerName);
});
socket.on("challengeRejected", function () {
    if (playerRole === "b") {
        renderBoard();
    }
});
socket.on("challengeAccepted", function () {
    if (playerRole === "b") {
        hideAllButtons();
        renderBoard();
    }
});
socket.on('noBlackPlayer', () => {
    showNoBlackPlayerPopup();
});
socket.on('playerNames', (whiteName, blackName) => {
    document.getElementById('whitePlayerName').textContent = whiteName ? whiteName : 'Waiting for player...';
    document.getElementById('blackPlayerName').textContent = blackName ? blackName : 'Waiting for player...';
});

socket.on('playerJoined', (message) => {
    addMessageToBox(message);
});

socket.on('spectatorJoined', (message) => {
    addMessageToBox(message);
});
socket.on('moveHistory', (history) => {
    if (playerRole !== null) {
        history.forEach(move => {
            updateMoveHistory(move);
            chess.move(move);
        });
        renderBoard();
    }
});
// renderBoard();
