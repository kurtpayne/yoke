package main

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	http.HandleFunc("/", handler)
	fmt.Printf("yoke-probe proxy listening on :%s\n", port)
	http.ListenAndServe(":"+port, nil)
}

func handler(w http.ResponseWriter, r *http.Request) {
	// CORS
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Accept")
	if r.Method == "OPTIONS" {
		w.WriteHeader(204)
		return
	}

	// Health check
	if r.URL.Path == "/" || r.URL.Path == "/health" {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"status":"ok","service":"yoke-probe"}`)
		return
	}

	// Proxy check-host.net requests
	// /check-http?host=example.com&max_nodes=20 -> https://check-host.net/check-http?...
	// /check-result/ID -> https://check-host.net/check-result/ID
	if strings.HasPrefix(r.URL.Path, "/check-") {
		targetURL := "https://check-host.net" + r.URL.Path
		if r.URL.RawQuery != "" {
			targetURL += "?" + r.URL.RawQuery
		}

		client := &http.Client{Timeout: 15 * time.Second}
		req, err := http.NewRequest("GET", targetURL, nil)
		if err != nil {
			http.Error(w, `{"error":"bad request"}`, 400)
			return
		}
		req.Header.Set("Accept", "application/json")
		req.Header.Set("User-Agent", "Yoke/1.0 (Domain Intelligence)")

		resp, err := client.Do(req)
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error":"upstream error: %s"}`, err.Error()), 502)
			return
		}
		defer resp.Body.Close()

		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-cache")
		w.WriteHeader(resp.StatusCode)
		io.Copy(w, resp.Body)
		return
	}

	http.Error(w, `{"error":"not found"}`, 404)
}
