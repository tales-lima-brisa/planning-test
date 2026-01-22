package entity

import "time"

// TRoom representa a tabela t_room
type TRoom struct {
	ID        int       `json:"id" db:"id"`
	Code      int       `json:"code" db:"code"`
	CreatedAt time.Time `json:"createdAt" db:"created_at"`
}

// TTask representa a tabela t_task
type TTask struct {
	ID        int       `json:"id" db:"id"`
	Points    int       `json:"points" db:"points"`
	CreatedAt time.Time `json:"createdAt" db:"created_at"`
}

// TUser representa um usuário na memória (não persistido no DBML, mas necessário para a lógica)
type User struct {
	ID     string
	RoomID string
}