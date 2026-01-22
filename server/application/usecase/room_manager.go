package usecase

import (
	"encoding/json"
	"log"
	"planning_test/application/dtos"
	"planning_test/domain/contract"
	"planning_test/infraestructure/websocket"
	"strconv"
	"sync"
)

type RoomManager struct {
	// rooms: Mapa de RoomID -> Conjunto de Clientes
	rooms    map[string]map[*websocket.Client]bool
	mutex    sync.RWMutex
	repo     contract.RoomRepository
}

func NewRoomManager(repo contract.RoomRepository) *RoomManager {
	return &RoomManager{
		rooms: make(map[string]map[*websocket.Client]bool),
		repo:  repo,
	}
}

func (rm *RoomManager) Join(roomCodeStr string, client *websocket.Client) error {
	// Validação de Negócio: Sala existe?
	roomCode, err := strconv.Atoi(roomCodeStr)
	if err == nil {
		// Se a conversão falhar, talvez seja um ID UUID, ajustamos conforme a regra.
		// Vamos supor que validamos no banco:
		room, err := rm.repo.FindRoomByCode(roomCode)
		if err != nil {
			log.Println("Erro ao validar sala:", err)
			// Em produção, decidir se barra a conexão ou deixa entrar como "sala temporária"
		}
		if room != nil {
			log.Printf("Validado: Sala %d existe no DB", room.ID)
		}
	}

	rm.mutex.Lock()
	defer rm.mutex.Unlock()

	if _, ok := rm.rooms[roomCodeStr]; !ok {
		rm.rooms[roomCodeStr] = make(map[*websocket.Client]bool)
	}
	rm.rooms[roomCodeStr][client] = true
	client.RoomID = roomCodeStr
	
	log.Printf("User %s joined room %s", client.UserID, roomCodeStr)
	return nil
}

func (rm *RoomManager) Leave(client *websocket.Client) {
	rm.mutex.Lock()
	defer rm.mutex.Unlock()

	roomID := client.RoomID
	if clients, ok := rm.rooms[roomID]; ok {
		if _, exists := clients[client]; exists {
			delete(clients, client)
			client.Close()
			log.Printf("User %s disconnected from room %s", client.UserID, roomID)

			if len(clients) == 0 {
				delete(rm.rooms, roomID)
			} else {
				// Broadcast assíncrono para não travar o Lock
				go rm.broadcastUserLeft(roomID, client.UserID)
			}
		}
	}
}

func (rm *RoomManager) Broadcast(msg dtos.Message, sender *websocket.Client) {
	rm.mutex.RLock()
	defer rm.mutex.RUnlock()

	if clients, ok := rm.rooms[msg.RoomID]; ok {
		msgBytes, _ := json.Marshal(msg)
		for client := range clients {
			if client != sender {
				client.SendMessage(msgBytes)
			}
		}
	}
}

func (rm *RoomManager) broadcastUserLeft(roomID, userID string) {
	// Recriar o Lock de leitura apenas para pegar a lista
	rm.mutex.RLock()
	defer rm.mutex.RUnlock()

	if clients, ok := rm.rooms[roomID]; ok {
		payload := dtos.UserLeftPayload{ID: userID}
		payloadBytes, _ := json.Marshal(payload)
		
		msg := dtos.Message{
			Type:    "USER_LEFT",
			RoomID:  roomID,
			Payload: payloadBytes,
			SenderID: "SERVER",
		}
		msgBytes, _ := json.Marshal(msg)

		for client := range clients {
			client.SendMessage(msgBytes)
		}
	}
}