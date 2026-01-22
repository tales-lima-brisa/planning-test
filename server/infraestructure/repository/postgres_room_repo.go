package repository

import (
	"database/sql"
	"fmt"
	"planning_test/domain/contract"
	"planning_test/domain/entity"
)

type PostgresRoomRepo struct {
	DB *sql.DB
}

// Garante que implementa a interface
var _ contract.RoomRepository = (*PostgresRoomRepo)(nil)

func NewPostgresRoomRepo(db *sql.DB) *PostgresRoomRepo {
	return &PostgresRoomRepo{DB: db}
}

func (r *PostgresRoomRepo) FindRoomByCode(code int) (*entity.TRoom, error) {
	query := `SELECT id, code, created_at FROM t_room WHERE code = $1`
	var room entity.TRoom
	
	err := r.DB.QueryRow(query, code).Scan(&room.ID, &room.Code, &room.CreatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil // Não encontrado
		}
		return nil, fmt.Errorf("database error: %v", err)
	}
	return &room, nil
}