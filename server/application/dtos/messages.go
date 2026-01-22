package dtos

import "encoding/json"

// Message define o protocolo JSON entre Front e Back
type Message struct {
	Type     string          `json:"type"`
	RoomID   string          `json:"roomId"`
	Payload  json.RawMessage `json:"payload"`
	SenderID string          `json:"senderId,omitempty"`
}

type JoinPayload struct {
	ID string `json:"id"`
}

type UserLeftPayload struct {
	ID string `json:"id"`
}