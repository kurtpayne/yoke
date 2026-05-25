package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"
)

var domainRe = regexp.MustCompile(`^[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$`)

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

	// Probe HTTP status from Fly.io (avoids CF Worker IP blocks)
	if r.URL.Path == "/probe-status" {
		domain := r.URL.Query().Get("domain")
		if domain == "" || !domainRe.MatchString(domain) {
			w.Header().Set("Content-Type", "application/json")
			http.Error(w, `{"error":"invalid or missing domain parameter"}`, 400)
			return
		}
		result := probeStatus(domain)
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-cache")
		json.NewEncoder(w).Encode(result)
		return
	}

	http.Error(w, `{"error":"not found"}`, 404)
}

type StatusResult struct {
	IsUp          bool    `json:"is_up"`
	StatusCode    *int    `json:"status_code"`
	ResponseTimeMs int    `json:"response_time_ms"`
	Error         *string `json:"error"`
	StatusLabel   string  `json:"status_label"`
	HttpBlocked   bool    `json:"http_blocked"`
}

func probeStatus(domain string) StatusResult {
	start := time.Now()

	currentURL := "https://" + domain
	var finalStatus int
	var lastErr error

	noRedirectClient := &http.Client{
		Timeout: 10 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	for i := 0; i < 5; i++ {
		req, err := http.NewRequest("GET", currentURL, nil)
		if err != nil {
			lastErr = err
			break
		}
		req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

		resp, err := noRedirectClient.Do(req)
		if err != nil {
			lastErr = err
			break
		}
		resp.Body.Close()
		finalStatus = resp.StatusCode

		if resp.StatusCode >= 300 && resp.StatusCode < 400 {
			loc := resp.Header.Get("Location")
			if loc != "" {
				if strings.HasPrefix(loc, "http") {
					currentURL = loc
				} else {
					currentURL = "https://" + domain + loc
				}
				continue
			}
		}
		break
	}

	elapsed := int(time.Since(start).Milliseconds())

	if lastErr != nil {
		errStr := lastErr.Error()
		return StatusResult{
			IsUp:          false,
			StatusCode:    nil,
			ResponseTimeMs: elapsed,
			Error:         &errStr,
			StatusLabel:   "DOWN",
			HttpBlocked:   false,
		}
	}

	isUp := finalStatus >= 200 && finalStatus < 400
	isBlocked := finalStatus == 403 || finalStatus == 503 || finalStatus == 502 || finalStatus == 429

	var errMsg *string
	if isBlocked {
		msg := fmt.Sprintf("Site returned HTTP %d — may be blocking automated requests", finalStatus)
		errMsg = &msg
	}

	label := "DOWN"
	if isUp {
		label = "UP"
	} else if isBlocked {
		label = "RESTRICTED"
	}

	return StatusResult{
		IsUp:          isUp || isBlocked,
		StatusCode:    &finalStatus,
		ResponseTimeMs: elapsed,
		Error:         errMsg,
		StatusLabel:   label,
		HttpBlocked:   isBlocked,
	}
}
