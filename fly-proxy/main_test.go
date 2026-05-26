package main

import (
	"crypto/tls"
	"crypto/x509"
	"net"
	"testing"
	"time"
)

func TestIsPrivateIP(t *testing.T) {
	tests := []struct {
		ip   string
		want bool
	}{
		{"127.0.0.1", true},
		{"10.0.0.1", true},
		{"10.255.255.255", true},
		{"172.16.0.1", true},
		{"172.31.255.255", true},
		{"192.168.0.1", true},
		{"192.168.255.255", true},
		{"169.254.1.1", true},
		{"0.0.0.0", true},
		{"100.64.0.1", true},
		{"8.8.8.8", false},
		{"1.1.1.1", false},
		{"140.82.112.3", false},   // github.com
		{"104.16.132.229", false}, // cloudflare
		// IPv6
		{"::1", true},
		{"fc00::1", true},
		{"fe80::1", true},
		{"ff02::1", true},
		{"2001:4860:4860::8888", false}, // Google DNS
	}

	for _, tt := range tests {
		ip := net.ParseIP(tt.ip)
		if ip == nil {
			t.Fatalf("failed to parse IP: %s", tt.ip)
		}
		got := isPrivateIP(ip)
		if got != tt.want {
			t.Errorf("isPrivateIP(%s) = %v, want %v", tt.ip, got, tt.want)
		}
	}
}

// mockRSAKey implements interface{ Size() int } for testing key size checks
type mockRSAKey struct {
	size int // in bytes (multiply by 8 for bits)
}

func (k *mockRSAKey) Size() int {
	return k.size
}

func TestComputeGrade(t *testing.T) {
	now := time.Now()
	validCert := &x509.Certificate{
		NotBefore:          now.Add(-24 * time.Hour),
		NotAfter:           now.Add(365 * 24 * time.Hour),
		PublicKeyAlgorithm: x509.ECDSA,
	}
	expiredCert := &x509.Certificate{
		NotBefore:          now.Add(-365 * 24 * time.Hour),
		NotAfter:           now.Add(-24 * time.Hour),
		PublicKeyAlgorithm: x509.ECDSA,
	}
	weakRSACert := &x509.Certificate{
		NotBefore:          now.Add(-24 * time.Hour),
		NotAfter:           now.Add(365 * 24 * time.Hour),
		PublicKeyAlgorithm: x509.RSA,
		PublicKey:          &mockRSAKey{size: 128}, // 1024 bits
	}

	tests := []struct {
		name       string
		cert       *x509.Certificate
		chainValid bool
		protocols  []string
		want       string
	}{
		{"TLS 1.3 valid chain", validCert, true, []string{"TLS 1.3", "TLS 1.2"}, "A+"},
		{"TLS 1.2 only valid chain", validCert, true, []string{"TLS 1.2"}, "A"},
		{"TLS 1.0 present", validCert, true, []string{"TLS 1.2", "TLS 1.0"}, "B"},
		{"Invalid chain", validCert, false, []string{"TLS 1.3"}, "T"},
		{"Expired cert", expiredCert, true, []string{"TLS 1.3"}, "T"},
		{"Weak RSA key", weakRSACert, true, []string{"TLS 1.3"}, "B"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			state := &tls.ConnectionState{}
			got := computeGrade(state, tt.cert, tt.chainValid, tt.protocols)
			if got != tt.want {
				t.Errorf("computeGrade() = %q, want %q", got, tt.want)
			}
		})
	}
}
