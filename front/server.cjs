/**
 * WebSocket Server for AgileVote
 * Run this file using Node.js: "node server.js"
 * Ensure you have the 'ws' package installed: "npm install ws"
 */

const { WebSocketServer } = require("ws");

const port = process.env.PORT || 8080;
const wss = new WebSocketServer({ port });

// Store active connections by room
// Map<RoomID, Set<WebSocket>>
const rooms = new Map();

console.log(`WebSocket server is running on port ${port}`);

wss.on("connection", (ws) => {
  let currentRoom = null;
  let currentUserId = null;

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);

      // Special handling for joining a room to track sockets
      if (data.type === "JOIN") {
        currentRoom = data.roomId;
        currentUserId = data.payload.id;

        if (!rooms.has(currentRoom)) {
          rooms.set(currentRoom, new Set());
        }
        rooms.get(currentRoom).add(ws);

        console.log(`User ${currentUserId} joined room ${currentRoom}`);
      }

      // Broadcast message to everyone in the room (including sender, for simplicity in React state sync)
      // Or exclude sender if optimistic UI handles it.
      // In this app architecture, we broadcast to others.
      if (data.roomId && rooms.has(data.roomId)) {
        rooms.get(data.roomId).forEach((client) => {
          if (client !== ws && client.readyState === 1) {
            // 1 = OPEN
            client.send(JSON.stringify(data));
          }
        });
      }
    } catch (e) {
      console.error("Error parsing message", e);
    }
  });

  ws.on("close", () => {
    if (currentRoom && rooms.has(currentRoom)) {
      rooms.get(currentRoom).delete(ws);

      console.log(
        `User ${
          currentUserId || "unknown"
        } disconnected from room ${currentRoom}`
      );

      // Broadcast USER_LEFT to remaining clients so they can handle admin succession
      const remainingClients = rooms.get(currentRoom);
      if (remainingClients.size > 0 && currentUserId) {
        const leaveMessage = JSON.stringify({
          type: "USER_LEFT",
          roomId: currentRoom,
          payload: { id: currentUserId },
          senderId: "SERVER",
        });
        remainingClients.forEach((client) => {
          if (client.readyState === 1) client.send(leaveMessage);
        });
      } else {
        // Room is empty, delete it
        rooms.delete(currentRoom);
      }
    }
  });
});
