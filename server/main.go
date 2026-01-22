package main

import (
	"database/sql"
	"log"
	"net/http"
	"os"
	"planning_test/application/usecase"
	"planning_test/infraestructure/repository"
	"planning_test/interface/ws"

	_ "github.com/lib/pq"
)

func main() {
	// 1. Configuração da Infrastructure (DB)
	// connStr := "postgres://user:pass@localhost/agilevote?sslmode=disable"
	// db, err := sql.Open("postgres", connStr)
	
	// Mock DB para o exemplo rodar:
	db := &sql.DB{} 

	// 2. Repositórios
	roomRepo := repository.NewPostgresRoomRepo(db)

	// 3. Application UseCases (Manager)
	roomManager := usecase.NewRoomManager(roomRepo)

	// 4. Interface Controllers
	wsController := ws.NewWSController(roomManager)

	// 5. Rotas HTTP
	http.HandleFunc("/ws", wsController.HandleConnections)

	// Start Server
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Go AgileVote Server running on port %s", port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatal(err)
	}
}