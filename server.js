//backend
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }, // Be more specific in production!
});

// Store active rooms to prevent duplicate codes
const activeRooms = new Set();
// Map socket ID to room ID for easy lookup on disconnect
const socketToRoom = {};

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on("create-room", () => {
    let roomId;
    // Generate a unique 4-digit code
    do {
      roomId = Math.floor(1000 + Math.random() * 9000).toString();
    } while (activeRooms.has(roomId));

    activeRooms.add(roomId);
    socket.join(roomId);
    socketToRoom[socket.id] = roomId;
    socket.emit("room-created", roomId);
    console.log(`Room created: ${roomId} by ${socket.id}`);
  });

  socket.on("join-room", (room) => {
    const existingRoom = io.sockets.adapter.rooms.get(room);

    if (!existingRoom) {
      socket.emit("room-not-found");
      return;
    }

    if (existingRoom.size >= 2) {
      socket.emit("room-full");
      return;
    }

    socket.join(room);
    socketToRoom[socket.id] = room;
    console.log(`Client ${socket.id} joined room ${room}`);
    socket.to(room).emit("peer-joined");
  });

  socket.on("signal", ({ room, data }) => {
    socket.to(room).emit("signal", data);
  });

  socket.on("cancel-session", (room) => {
    // Host cancels, notify the other peer and destroy the room
    console.log(`Host ${socket.id} cancelled session ${room}`);
    socket.to(room).emit("session-cancelled");
    activeRooms.delete(room);
    // Optionally disconnect both sockets
    const roomSockets = io.sockets.adapter.rooms.get(room);
    if (roomSockets) {
      roomSockets.forEach(socketId => {
        io.sockets.sockets.get(socketId).disconnect(true);
      });
    }
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
    const roomId = socketToRoom[socket.id];
    if (roomId) {
      // Notify the other person in the room that their peer has left.
      socket.to(roomId).emit("peer-left");

      // Clean up
      delete socketToRoom[socket.id];

      const room = io.sockets.adapter.rooms.get(roomId);
      // If the room is now empty, make the code available again
      if (!room || room.size === 0) {
        activeRooms.delete(roomId);
        console.log(`Room ${roomId} is now empty and available.`);
      }
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Signaling server running on port ${PORT}`));