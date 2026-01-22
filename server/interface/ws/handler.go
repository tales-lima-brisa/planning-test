package ws

import (
	"encoding/json"
	"log"
	"net/http"
	"planning_test/application/dtos"
	"planning_test/application/usecase"
	infraWS "planning_test/infraestructure/websocket"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type WSController struct {
	Manager *usecase.RoomManager
}

func NewWSController(manager *usecase.RoomManager) *WSController {
	return &WSController{Manager: manager}
}

func (c *WSController) HandleConnections(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Upgrade error:", err)
		return
	}

	client := &infraWS.Client{Conn: conn}
	
	// Garante limpeza na desconexão
	defer c.Manager.Leave(client)

	for {
		// Lê a mensagem bruta
		_, messageBytes, err := conn.ReadMessage()
		if err != nil {
			log.Printf("Read error: %v", err)
			break
		}

		var msg dtos.Message
		if err := json.Unmarshal(messageBytes, &msg); err != nil {
			log.Printf("JSON error: %v", err)
			continue
		}

		// Roteamento básico de ações
		if msg.Type == "JOIN" {
			var joinData dtos.JoinPayload
			if err := json.Unmarshal(msg.Payload, &joinData); err == nil {
				client.UserID = joinData.ID
			}
			c.Manager.Join(msg.RoomID, client)
		}

		// Broadcast para a sala (se o usuário já estiver em uma)
		if client.RoomID != "" {
			msg.RoomID = client.RoomID // Segurança: força o ID da sala atual
			c.Manager.Broadcast(msg, client)
		}
	}
}