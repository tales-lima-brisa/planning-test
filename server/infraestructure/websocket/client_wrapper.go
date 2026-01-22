package websocket

import (
	"github.com/gorilla/websocket"
)

// Client encapsula a conexão técnica e dados do usuário
type Client struct {
	Conn   *websocket.Conn
	UserID string
	RoomID string
}

// SendMessage envia JSON thread-safe (básico)
func (c *Client) SendMessage(msg []byte) error {
	return c.Conn.WriteMessage(websocket.TextMessage, msg)
}

func (c *Client) Close() {
	c.Conn.Close()
}