package main

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"
)

var domainRe = regexp.MustCompile(`^[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$`)

// ─── SSRF Protection ────────────────────────────────────────────────
// Block connections to private, reserved, and link-local IP ranges.
// Applied at dial time to catch DNS rebinding attacks.

var privateRanges []*net.IPNet

func init() {
	cidrs := []string{
		"127.0.0.0/8",     // IPv4 loopback
		"10.0.0.0/8",      // RFC1918
		"172.16.0.0/12",   // RFC1918
		"192.168.0.0/16",  // RFC1918
		"169.254.0.0/16",  // link-local
		"224.0.0.0/4",     // multicast
		"0.0.0.0/8",       // unspecified
		"100.64.0.0/10",   // carrier-grade NAT
		"192.0.0.0/24",    // IETF protocol
		"192.0.2.0/24",    // documentation (TEST-NET-1)
		"198.51.100.0/24", // documentation (TEST-NET-2)
		"203.0.113.0/24",  // documentation (TEST-NET-3)
		"198.18.0.0/15",   // benchmarking
		"240.0.0.0/4",     // reserved
		"::1/128",         // IPv6 loopback
		"fc00::/7",        // IPv6 unique local
		"fe80::/10",       // IPv6 link-local
		"ff00::/8",        // IPv6 multicast
	}
	for _, cidr := range cidrs {
		_, network, err := net.ParseCIDR(cidr)
		if err == nil {
			privateRanges = append(privateRanges, network)
		}
	}
}

func isPrivateIP(ip net.IP) bool {
	// Check IPv4-mapped IPv6 addresses (::ffff:x.x.x.x)
	if v4 := ip.To4(); v4 != nil {
		ip = v4
	}
	for _, network := range privateRanges {
		if network.Contains(ip) {
			return true
		}
	}
	return false
}

// safeDialContext resolves the hostname and rejects private IPs before connecting.
func safeDialContext(ctx context.Context, network, addr string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return nil, fmt.Errorf("invalid address: %s", addr)
	}
	ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
	if err != nil {
		return nil, err
	}
	for _, ip := range ips {
		if isPrivateIP(ip.IP) {
			return nil, fmt.Errorf("connection to private/reserved IP %s blocked (SSRF protection)", ip.IP)
		}
	}
	// Connect to the first resolved address
	dialer := &net.Dialer{Timeout: 10 * time.Second}
	return dialer.DialContext(ctx, network, net.JoinHostPort(ips[0].IP.String(), port))
}

// safeTransport returns an http.Transport that rejects private IPs at dial time.
func safeTransport() *http.Transport {
	return &http.Transport{
		DialContext:       safeDialContext,
		ForceAttemptHTTP2: true,
		TLSClientConfig:   &tls.Config{InsecureSkipVerify: false},
	}
}

// safeTLSDial resolves the hostname, rejects private IPs, then does a TLS handshake.
func safeTLSDial(domain string, timeout time.Duration, tlsConfig *tls.Config) (*tls.Conn, error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	ips, err := net.DefaultResolver.LookupIPAddr(ctx, domain)
	if err != nil {
		return nil, err
	}
	for _, ip := range ips {
		if isPrivateIP(ip.IP) {
			return nil, fmt.Errorf("connection to private/reserved IP %s blocked (SSRF protection)", ip.IP)
		}
	}
	dialer := &net.Dialer{Timeout: timeout}
	addr := net.JoinHostPort(ips[0].IP.String(), "443")
	conn, err := tls.DialWithDialer(dialer, "tcp", addr, tlsConfig)
	return conn, err
}

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

	// SSL/TLS probe — direct TLS handshake for instant cert info
	if r.URL.Path == "/probe-ssl" {
		domain := r.URL.Query().Get("domain")
		if domain == "" || !domainRe.MatchString(domain) {
			w.Header().Set("Content-Type", "application/json")
			http.Error(w, `{"error":"invalid or missing domain parameter"}`, 400)
			return
		}
		result := probeSSL(domain)
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-cache")
		json.NewEncoder(w).Encode(result)
		return
	}

	// HTTP protocol probe — detect HTTP/2 and HTTP/3 support
	if r.URL.Path == "/probe-protocols" {
		domain := r.URL.Query().Get("domain")
		if domain == "" || !domainRe.MatchString(domain) {
			w.Header().Set("Content-Type", "application/json")
			http.Error(w, `{"error":"invalid or missing domain parameter"}`, 400)
			return
		}
		result := probeProtocols(domain)
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-cache")
		json.NewEncoder(w).Encode(result)
		return
	}

	http.Error(w, `{"error":"not found"}`, 404)
}

// ─── SSL Probe ──────────────────────────────────────────────────────

type SSLResult struct {
	Grade       string   `json:"grade"`
	Issuer      string   `json:"issuer"`
	Subject     string   `json:"subject"`
	ValidFrom   string   `json:"valid_from"`
	ValidTo     string   `json:"valid_to"`
	KeyAlg      string   `json:"key_alg"`
	KeySize     int      `json:"key_size"`
	Protocols   []string `json:"protocols"`
	ChainDepth  int      `json:"chain_depth"`
	ChainValid  bool     `json:"chain_valid"`
	SANs        []string `json:"sans"`
	Serial      string   `json:"serial"`
	Fingerprint string   `json:"fingerprint"`
	ProbeMs     int      `json:"probe_ms"`
	Error       *string  `json:"error"`
}

func probeSSL(domain string) SSLResult {
	start := time.Now()

	// Try TLS 1.3 first, then fall back to 1.2
	protocols := []string{}
	var connState *tls.ConnectionState
	var connectErr error

	// Attempt connection with TLS 1.2+ (Go's default)
	conn, err := safeTLSDial(domain, 8*time.Second, &tls.Config{
		ServerName:         domain,
		InsecureSkipVerify: false,
	})
	if err != nil {
		// Try with InsecureSkipVerify to still get cert info for expired/self-signed
		conn, err = safeTLSDial(domain, 8*time.Second, &tls.Config{
			ServerName:         domain,
			InsecureSkipVerify: true,
		})
		if err != nil {
			connectErr = err
		}
	}

	if connectErr != nil {
		elapsed := int(time.Since(start).Milliseconds())
		errStr := connectErr.Error()
		return SSLResult{
			Grade:   "T",
			ProbeMs: elapsed,
			Error:   &errStr,
		}
	}
	defer conn.Close()

	state := conn.ConnectionState()
	connState = &state

	// Detect supported protocols by the negotiated version
	switch connState.Version {
	case tls.VersionTLS13:
		protocols = append(protocols, "TLS 1.3")
		// Also test TLS 1.2 support
		conn12, err := safeTLSDial(domain, 8*time.Second, &tls.Config{
			ServerName:         domain,
			InsecureSkipVerify: true,
			MaxVersion:         tls.VersionTLS12,
		})
		if err == nil {
			if conn12.ConnectionState().Version == tls.VersionTLS12 {
				protocols = append(protocols, "TLS 1.2")
			}
			conn12.Close()
		}
	case tls.VersionTLS12:
		protocols = append(protocols, "TLS 1.2")
	case tls.VersionTLS11:
		protocols = append(protocols, "TLS 1.1")
	case tls.VersionTLS10:
		protocols = append(protocols, "TLS 1.0")
	}

	elapsed := int(time.Since(start).Milliseconds())

	if len(connState.PeerCertificates) == 0 {
		errStr := "No peer certificates returned"
		return SSLResult{
			Grade:     "T",
			Protocols: protocols,
			ProbeMs:   elapsed,
			Error:     &errStr,
		}
	}

	leaf := connState.PeerCertificates[0]

	// Extract key info
	keyAlg := ""
	keySize := 0
	switch pub := leaf.PublicKey.(type) {
	case interface{ Size() int }:
		keySize = pub.Size() * 8
	}
	switch leaf.PublicKeyAlgorithm {
	case x509.RSA:
		keyAlg = "RSA"
	case x509.ECDSA:
		keyAlg = "ECDSA"
	case x509.Ed25519:
		keyAlg = "Ed25519"
	default:
		keyAlg = leaf.PublicKeyAlgorithm.String()
	}

	// Validate chain
	chainValid := true
	opts := x509.VerifyOptions{
		DNSName: domain,
	}
	// Add intermediate certificates to the pool
	if len(connState.PeerCertificates) > 1 {
		intermediates := x509.NewCertPool()
		for _, cert := range connState.PeerCertificates[1:] {
			intermediates.AddCert(cert)
		}
		opts.Intermediates = intermediates
	}
	_, verifyErr := leaf.Verify(opts)
	if verifyErr != nil {
		chainValid = false
	}

	// SANs (limit to 20)
	sans := leaf.DNSNames
	if len(sans) > 20 {
		sans = sans[:20]
	}

	// Compute grade
	grade := computeGrade(connState, leaf, chainValid, protocols)

	// Serial as hex string
	serial := ""
	if leaf.SerialNumber != nil {
		serial = fmt.Sprintf("%X", leaf.SerialNumber)
	}

	return SSLResult{
		Grade:      grade,
		Issuer:     leaf.Issuer.String(),
		Subject:    leaf.Subject.String(),
		ValidFrom:  leaf.NotBefore.UTC().Format(time.RFC3339),
		ValidTo:    leaf.NotAfter.UTC().Format(time.RFC3339),
		KeyAlg:     keyAlg,
		KeySize:    keySize,
		Protocols:  protocols,
		ChainDepth: len(connState.PeerCertificates),
		ChainValid: chainValid,
		SANs:       sans,
		Serial:     serial,
		ProbeMs:    elapsed,
		Error:      nil,
	}
}

func computeGrade(state *tls.ConnectionState, leaf *x509.Certificate, chainValid bool, protocols []string) string {
	if !chainValid {
		return "T" // Trust issues (expired, self-signed, wrong hostname)
	}

	now := time.Now()
	if now.Before(leaf.NotBefore) || now.After(leaf.NotAfter) {
		return "T"
	}

	hasTLS13 := false
	hasTLS10or11 := false
	for _, p := range protocols {
		if p == "TLS 1.3" {
			hasTLS13 = true
		}
		if p == "TLS 1.0" || p == "TLS 1.1" {
			hasTLS10or11 = true
		}
	}

	// Key strength check
	weakKey := false
	switch leaf.PublicKeyAlgorithm {
	case x509.RSA:
		if k, ok := leaf.PublicKey.(interface{ Size() int }); ok {
			if k.Size()*8 < 2048 {
				weakKey = true
			}
		}
	}

	if hasTLS10or11 {
		return "B"
	}
	if weakKey {
		return "B"
	}
	if hasTLS13 {
		return "A+"
	}
	return "A"
}

// ─── HTTP Status Probe ──────────────────────────────────────────────

type StatusResult struct {
	IsUp           bool    `json:"is_up"`
	StatusCode     *int    `json:"status_code"`
	ResponseTimeMs int     `json:"response_time_ms"`
	Error          *string `json:"error"`
	StatusLabel    string  `json:"status_label"`
	HttpBlocked    bool    `json:"http_blocked"`
}

func probeStatus(domain string) StatusResult {
	start := time.Now()

	currentURL := "https://" + domain
	var finalStatus int
	var lastErr error

	noRedirectClient := &http.Client{
		Timeout:   10 * time.Second,
		Transport: safeTransport(),
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
			IsUp:           false,
			StatusCode:     nil,
			ResponseTimeMs: elapsed,
			Error:          &errStr,
			StatusLabel:    "DOWN",
			HttpBlocked:    false,
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
		IsUp:           isUp || isBlocked,
		StatusCode:     &finalStatus,
		ResponseTimeMs: elapsed,
		Error:          errMsg,
		StatusLabel:    label,
	}
}

// ─── HTTP Protocol Probe ────────────────────────────────────────────

type ProtocolResult struct {
	HTTP2  bool    `json:"http2"`
	HTTP3  bool    `json:"http3"`
	AltSvc *string `json:"alt_svc"`
	Error  *string `json:"error"`
}

func probeProtocols(domain string) ProtocolResult {
	// Make an HTTP/2 request and check alt-svc header for h3
	client := &http.Client{
		Timeout:   8 * time.Second,
		Transport: safeTransport(),
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	req, err := http.NewRequest("HEAD", "https://"+domain, nil)
	if err != nil {
		errStr := err.Error()
		return ProtocolResult{Error: &errStr}
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

	resp, err := client.Do(req)
	if err != nil {
		errStr := err.Error()
		return ProtocolResult{Error: &errStr}
	}
	defer resp.Body.Close()

	// Go's default HTTP client negotiates HTTP/2 via ALPN when available
	http2 := resp.ProtoMajor == 2

	// Check alt-svc header for HTTP/3 advertisement
	altSvc := resp.Header.Get("Alt-Svc")
	var altSvcPtr *string
	http3 := false
	if altSvc != "" {
		altSvcPtr = &altSvc
		// h3= or h3-29= etc indicates HTTP/3 support
		if strings.Contains(altSvc, "h3=") || strings.Contains(altSvc, "h3-") {
			http3 = true
		}
	}

	return ProtocolResult{
		HTTP2:  http2,
		HTTP3:  http3,
		AltSvc: altSvcPtr,
	}
}
