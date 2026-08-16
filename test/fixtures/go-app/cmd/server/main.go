package main

import (
	"net/http"

	"example.com/demo/internal/auth"
)

func main() {
	http.ListenAndServe(":8080", nil)
	auth.Check()
}
