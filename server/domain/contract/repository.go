package contract

import "planning_test/domain/entity"

type RoomRepository interface {
	FindRoomByCode(code int) (*entity.TRoom, error)
	// Add other methods like SaveVote, CreateSprint, etc.
}