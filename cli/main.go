package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/charmbracelet/lipgloss"
	toml "github.com/pelletier/go-toml/v2"
	"github.com/spf13/cobra"
)

var version = "dev"

var apiBase string

// ─── Config ─────────────────────────────────────────────────────────

type Config struct {
	OpenRouterKey  string `toml:"openrouter_key,omitempty"`
	SuppressAIHint bool   `toml:"suppress_ai_hint,omitempty"`
	DefaultModel   string `toml:"default_model,omitempty"`
	BaseURL        string `toml:"base_url,omitempty"`
}

const defaultBaseURL = "https://yoke.lol"

// maxResponseBytes caps the maximum API response body size (10 MB).
const maxResponseBytes = 10 << 20

// resolveBaseURL determines which Yoke instance the CLI talks to.
// Precedence: YOKE_BASE_URL env var > config file base_url > yoke.lol.
// Always returned without a trailing slash.
func resolveBaseURL(cfg Config) string {
	url := defaultBaseURL
	if cfg.BaseURL != "" {
		url = cfg.BaseURL
	}
	if env := strings.TrimSpace(os.Getenv("YOKE_BASE_URL")); env != "" {
		url = env
	}
	return strings.TrimRight(strings.TrimSpace(url), "/")
}

func configPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".yoke.toml")
}

func loadConfig() Config {
	var cfg Config
	data, err := os.ReadFile(configPath())
	if err != nil {
		// Try legacy .yokerc (JSON) and migrate if found
		home, _ := os.UserHomeDir()
		legacy := filepath.Join(home, ".yokerc")
		data, err = os.ReadFile(legacy)
		if err != nil {
			return cfg
		}
		// Parse legacy JSON config using a JSON-tagged struct
		var legacyCfg struct {
			OpenRouterKey  string `json:"openrouter_key"`
			SuppressAIHint bool   `json:"suppress_ai_hint"`
			DefaultModel   string `json:"default_model"`
			BaseURL        string `json:"base_url"`
		}
		if json.Unmarshal(data, &legacyCfg) == nil && legacyCfg.OpenRouterKey != "" {
			cfg = Config{
				OpenRouterKey:  legacyCfg.OpenRouterKey,
				SuppressAIHint: legacyCfg.SuppressAIHint,
				DefaultModel:   legacyCfg.DefaultModel,
				BaseURL:        legacyCfg.BaseURL,
			}
			// Migrate to TOML
			saveConfig(cfg)
			os.Remove(legacy)
		}
		return cfg
	}
	toml.Unmarshal(data, &cfg)
	return cfg
}

func saveConfig(cfg Config) {
	data, _ := toml.Marshal(cfg)
	os.WriteFile(configPath(), data, 0600)
}

// ─── Styles ─────────────────────────────────────────────────────────

var (
	title    = lipgloss.NewStyle().Bold(true)
	dim      = lipgloss.NewStyle().Faint(true)
	good     = lipgloss.NewStyle().Foreground(lipgloss.Color("2"))
	warn     = lipgloss.NewStyle().Foreground(lipgloss.Color("3"))
	bad      = lipgloss.NewStyle().Foreground(lipgloss.Color("1"))
	info     = lipgloss.NewStyle().Foreground(lipgloss.Color("4"))
	accent   = lipgloss.NewStyle().Foreground(lipgloss.Color("6"))
	axisName = lipgloss.NewStyle().Foreground(lipgloss.Color("6")).Width(14)

	cardBox = lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("8")).
		Padding(0, 1)
)

func gradeStyle(grade string) lipgloss.Style {
	switch {
	case strings.HasPrefix(grade, "A"):
		return good
	case strings.HasPrefix(grade, "B"):
		return info
	case strings.HasPrefix(grade, "C"):
		return warn
	default:
		return bad
	}
}

// ─── API Types ──────────────────────────────────────────────────────

type AnalysisResult struct {
	Domain        string          `json:"domain"`
	Score         *ScoreBlock     `json:"domain_score"`
	SSL           *SSLInfo        `json:"ssl"`
	Hosting       *HostInfo       `json:"hosting"`
	TechStack     json.RawMessage `json:"tech_stack"`
	Performance   *PerfInfo       `json:"performance"`
	AnalyzedAt    string          `json:"analyzed_at"`
	Cached        bool            `json:"cached"`
	CachedAt      *int64          `json:"cached_at,omitempty"`
	HTTPProtocols *HTTPProto      `json:"http_protocols"`
}

type ScoreBlock struct {
	Composite int                `json:"composite"`
	Grade     string             `json:"grade"`
	Axes      map[string]AxisVal `json:"axes"`
	Archetype *Archetype         `json:"archetype"`
}

type AxisVal struct {
	Score    int       `json:"score"`
	Weight   float64   `json:"weight"`
	Findings []Finding `json:"findings"`
}

type Finding struct {
	Signal   string `json:"signal"`
	Axis     string `json:"axis"`
	Severity string `json:"severity"`
	Label    string `json:"label"`
	Weight   int    `json:"weight"`
}

type Archetype struct {
	Detected   string  `json:"detected"`
	Confidence float64 `json:"confidence"`
}

type SSLInfo struct {
	Grade   string `json:"grade"`
	Issuer  string `json:"issuer"`
	Subject string `json:"subject"`
	ValidTo string `json:"valid_to"`
}

type HostInfo struct {
	Provider string `json:"provider"`
	CDN      string `json:"cdn"`
	WAF      string `json:"waf"`
}

type PerfInfo struct {
	Score float64 `json:"score"`
	LCP   float64 `json:"lcp"`
	CLS   float64 `json:"cls"`
	TTFB  float64 `json:"ttfb"`
	FCP   float64 `json:"fcp"`
}

type HTTPProto struct {
	HTTP2 bool `json:"http2"`
	HTTP3 bool `json:"http3"`
}

// ─── API Client ─────────────────────────────────────────────────────

func fetchJSON(url string) ([]byte, error) {
	client := &http.Client{Timeout: 90 * time.Second}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "yoke-cli/"+version)

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxResponseBytes))
	if err != nil {
		return nil, fmt.Errorf("read failed: %w", err)
	}
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
	}
	return body, nil
}

// ─── Spinner ────────────────────────────────────────────────────────

// spinner shows an animated spinner with a message on a single line.
// Call stop() to clear the line and stop the animation.
type spinner struct {
	msg    string
	stopCh chan struct{}
	wg     sync.WaitGroup
}

var spinnerFrames = []string{"⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"}

func startSpinner(message string) *spinner {
	s := &spinner{msg: message, stopCh: make(chan struct{})}
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		i := 0
		ticker := time.NewTicker(80 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-s.stopCh:
				fmt.Print("\033[2K\r") // clear the spinner line
				return
			case <-ticker.C:
				frame := accent.Render(spinnerFrames[i%len(spinnerFrames)])
				fmt.Printf("\033[2K\r  %s %s", frame, dim.Render(s.msg))
				i++
			}
		}
	}()
	return s
}

func (s *spinner) stop() {
	close(s.stopCh)
	s.wg.Wait()
}

func fetchAnalysis(domain string) (*AnalysisResult, error) {
	body, err := fetchJSON(apiBase + "/" + domain)
	if err != nil {
		return nil, err
	}
	var result AnalysisResult
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("parse failed: %w", err)
	}
	return &result, nil
}

// ─── SSE Streaming Analysis ─────────────────────────────────────────

// sseCheck tracks one in-flight check during streaming.
type sseCheck struct {
	Key   string `json:"key"`
	Label string `json:"label"`
	Done  bool
	Error bool
}

// fetchAnalysisStream connects to the SSE streaming endpoint and shows
// live terminal progress as each check completes.  Falls back to the
// plain JSON endpoint when the server doesn't support streaming.
func fetchAnalysisStream(domain string) (*AnalysisResult, error) {
	client := &http.Client{Timeout: 120 * time.Second}

	// Use POST /api/analyze which supports SSE streaming
	payload := fmt.Sprintf(`{"domain":%q}`, domain)
	req, err := http.NewRequest("POST", apiBase+"/api/analyze", strings.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "text/event-stream")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "yoke-cli/"+version)

	resp, err := client.Do(req)
	if err != nil {
		return fetchAnalysis(domain) // fallback
	}
	defer resp.Body.Close()

	// If server returned JSON instead of SSE, parse it directly.
	ct := resp.Header.Get("Content-Type")
	if !strings.Contains(ct, "text/event-stream") {
		body, err := io.ReadAll(io.LimitReader(resp.Body, maxResponseBytes))
		if err != nil {
			return nil, fmt.Errorf("read failed: %w", err)
		}
		if resp.StatusCode != 200 {
			return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
		}
		var result AnalysisResult
		if err := json.Unmarshal(body, &result); err != nil {
			return nil, fmt.Errorf("parse failed: %w", err)
		}
		return &result, nil
	}

	// ── Parse SSE stream ────────────────────────────────────────────
	var (
		checks    []sseCheck
		completed int
		total     int
		eventType string
		lines     int // how many progress lines we printed (for clearing)
	)

	scanner := bufio.NewScanner(resp.Body)
	// Increase scanner buffer for the large "done" event payload.
	scanner.Buffer(make([]byte, 0, 512*1024), 10*1024*1024)

	for scanner.Scan() {
		line := scanner.Text()

		if strings.HasPrefix(line, "event:") {
			eventType = strings.TrimSpace(strings.TrimPrefix(line, "event:"))
			continue
		}
		if !strings.HasPrefix(line, "data:") {
			continue // blank line or comment
		}
		data := strings.TrimPrefix(line, "data:")
		data = strings.TrimSpace(data)

		switch eventType {
		case "phase":
			var p struct {
				Total  int        `json:"total"`
				Checks []sseCheck `json:"checks"`
			}
			if json.Unmarshal([]byte(data), &p) == nil {
				if p.Total > 0 {
					total = p.Total
				}
				if len(p.Checks) > 0 {
					checks = p.Checks
				}
			}

		case "result":
			var r struct {
				Key       string `json:"key"`
				Label     string `json:"label"`
				Completed *int   `json:"completed"`
				Total     *int   `json:"total"`
				Error     bool   `json:"error"`
			}
			if json.Unmarshal([]byte(data), &r) == nil {
				if r.Completed != nil {
					completed = *r.Completed
				}
				if r.Total != nil {
					total = *r.Total
				}
				// Update our check list.
				found := false
				for i := range checks {
					if checks[i].Key == r.Key {
						checks[i].Done = true
						checks[i].Error = r.Error
						if r.Label != "" {
							checks[i].Label = r.Label
						}
						found = true
						break
					}
				}
				if !found && r.Key != "" {
					label := r.Label
					if label == "" {
						label = r.Key
					}
					checks = append(checks, sseCheck{Key: r.Key, Label: label, Done: true, Error: r.Error})
				}
			}
			lines = renderProgress(domain, checks, completed, total, lines)

		case "done":
			clearProgress(lines)
			var result AnalysisResult
			if err := json.Unmarshal([]byte(data), &result); err != nil {
				return nil, fmt.Errorf("parse failed: %w", err)
			}
			return &result, nil

		case "error":
			clearProgress(lines)
			var e struct {
				Message string `json:"message"`
			}
			if json.Unmarshal([]byte(data), &e) == nil {
				return nil, fmt.Errorf("analysis failed: %s", e.Message)
			}
			return nil, fmt.Errorf("analysis failed")
		}
		eventType = "" // reset for next event
	}
	if err := scanner.Err(); err != nil {
		clearProgress(lines)
		return nil, fmt.Errorf("stream read error: %w", err)
	}

	clearProgress(lines)
	return nil, fmt.Errorf("stream ended without results")
}

// renderProgress draws the live progress display and returns the number
// of lines printed (so we can clear them on the next update).
func renderProgress(domain string, checks []sseCheck, completed, total int, prevLines int) int {
	clearProgress(prevLines)

	if total == 0 {
		line := fmt.Sprintf("  %s %s", accent.Render("⚡"), dim.Render("Analyzing "+domain+"..."))
		fmt.Print(line)
		return 1
	}

	// Progress bar: ████████░░░░░░░░░░░░ 12/26
	barWidth := 20
	filled := 0
	if total > 0 {
		filled = completed * barWidth / total
	}
	if filled > barWidth {
		filled = barWidth
	}
	bar := good.Render(strings.Repeat("█", filled)) + dim.Render(strings.Repeat("░", barWidth-filled))
	header := fmt.Sprintf("  %s %s %s %s",
		accent.Render("⚡"),
		dim.Render("Analyzing "+domain+"..."),
		bar,
		dim.Render(fmt.Sprintf("%d/%d", completed, total)))
	fmt.Println(header)

	// Check status line: show completed checks with ✓/✗, pending with ·
	var parts []string
	maxShow := 12 // limit how many checks to show on one line
	shown := 0
	for _, c := range checks {
		if shown >= maxShow {
			remaining := len(checks) - shown
			if remaining > 0 {
				parts = append(parts, dim.Render(fmt.Sprintf("+%d more", remaining)))
			}
			break
		}
		shortLabel := c.Label
		if len(shortLabel) > 12 {
			shortLabel = shortLabel[:12]
		}
		if c.Done && c.Error {
			parts = append(parts, bad.Render("✗")+dim.Render(" "+shortLabel))
		} else if c.Done {
			parts = append(parts, good.Render("✓")+dim.Render(" "+shortLabel))
		} else {
			parts = append(parts, dim.Render("· "+shortLabel))
		}
		shown++
	}
	if len(parts) > 0 {
		fmt.Println("  " + strings.Join(parts, "  "))
		return 2
	}

	return 1
}

// clearProgress moves the cursor up and clears the lines we previously printed.
func clearProgress(lines int) {
	for i := 0; i < lines; i++ {
		if i == 0 && lines > 1 {
			// We're below the last printed line, move up
			fmt.Print("\033[A") // cursor up
		} else if i > 0 {
			fmt.Print("\033[A") // cursor up
		}
		fmt.Print("\033[2K") // clear line
		fmt.Print("\r")
	}
}

// ─── Rendering ──────────────────────────────────────────────────────

func severityIcon(s string) string {
	switch s {
	case "good":
		return good.Render("✓")
	case "critical":
		return bad.Render("✗")
	case "high":
		return bad.Render("!")
	case "medium":
		return warn.Render("~")
	case "low":
		return warn.Render("·")
	case "info":
		return info.Render("ℹ")
	default:
		return dim.Render("·")
	}
}

func renderBar(score int, width int) string {
	filled := score * width / 100
	if filled > width {
		filled = width
	}
	bar := strings.Repeat("█", filled) + strings.Repeat("░", width-filled)
	style := good
	if score < 70 {
		style = bad
	} else if score < 85 {
		style = warn
	}
	return style.Render(bar)
}

func printAnalysis(r *AnalysisResult) {
	if r.Score == nil {
		fmt.Println(warn.Render("No score data available"))
		return
	}

	var lines []string

	// Cached results banner
	if r.Cached {
		ts := r.AnalyzedAt
		if r.CachedAt != nil {
			t := time.UnixMilli(*r.CachedAt)
			ts = t.Format("Jan 2 3:04 PM")
		}
		lines = append(lines, dim.Render(fmt.Sprintf("⚡ Cached results from %s", ts)))
		lines = append(lines, "")
	}

	// Header: domain + score + grade
	grade := gradeStyle(r.Score.Grade).Bold(true).Render(r.Score.Grade)
	lines = append(lines, fmt.Sprintf(
		"%s  %s %s",
		title.Render(r.Domain),
		title.Render(fmt.Sprintf("%d/100", r.Score.Composite)),
		grade,
	))

	if r.Score.Archetype != nil && r.Score.Archetype.Detected != "" {
		lines = append(lines, dim.Render(r.Score.Archetype.Detected))
	}
	lines = append(lines, "")

	// Axis scores with bars
	for _, name := range sortedAxes(r.Score.Axes) {
		ax := r.Score.Axes[name]
		label := axisName.Render(strings.ToUpper(name))
		bar := renderBar(ax.Score, 20)
		lines = append(lines, fmt.Sprintf("%s %s %s", label, bar, dim.Render(fmt.Sprintf("%d", ax.Score))))
	}
	lines = append(lines, "")

	// Quick facts row
	var facts []string
	if r.SSL != nil && r.SSL.Grade != "" {
		facts = append(facts, fmt.Sprintf("SSL %s", r.SSL.Grade))
	}
	if r.HTTPProtocols != nil {
		if r.HTTPProtocols.HTTP3 {
			facts = append(facts, "HTTP/3")
		} else if r.HTTPProtocols.HTTP2 {
			facts = append(facts, "HTTP/2")
		}
	}
	if r.Hosting != nil && r.Hosting.Provider != "" {
		facts = append(facts, r.Hosting.Provider)
	}
	if r.Hosting != nil && r.Hosting.CDN != "" {
		facts = append(facts, r.Hosting.CDN)
	}
	if r.Performance != nil && r.Performance.LCP > 0 {
		lcpSec := r.Performance.LCP / 1000
		if lcpSec >= 1 {
			facts = append(facts, fmt.Sprintf("LCP %.1fs", lcpSec))
		} else {
			facts = append(facts, fmt.Sprintf("LCP %dms", int(r.Performance.LCP)))
		}
	}
	if len(facts) > 0 {
		lines = append(lines, dim.Render(strings.Join(facts, " · ")))
		lines = append(lines, "")
	}

	// Key findings
	var goods, issues, infos []Finding
	for _, name := range sortedAxes(r.Score.Axes) {
		for _, f := range r.Score.Axes[name].Findings {
			switch f.Severity {
			case "good":
				goods = append(goods, f)
			case "critical", "high", "medium":
				issues = append(issues, f)
			case "low", "info":
				infos = append(infos, f)
			}
		}
	}

	if len(issues) > 0 || len(infos) > 0 || len(goods) > 0 {
		lines = append(lines, title.Render("Findings"))
		for _, f := range issues {
			lines = append(lines, fmt.Sprintf("%s %s", severityIcon(f.Severity), f.Label))
		}
		for _, f := range infos {
			lines = append(lines, fmt.Sprintf("%s %s", severityIcon(f.Severity), f.Label))
		}
		for _, f := range goods {
			lines = append(lines, fmt.Sprintf("%s %s", severityIcon(f.Severity), f.Label))
		}
	}

	// Render as card
	content := strings.Join(lines, "\n")
	fmt.Println()
	fmt.Println(cardBox.Render(content))
	fmt.Println()

	// Footer outside the card
	fmt.Printf("  %s\n\n", dim.Render(apiBase+"/"+r.Domain))

	// AI hint (one-time, dismissable)
	cfg := loadConfig()
	if cfg.OpenRouterKey == "" && !cfg.SuppressAIHint {
		fmt.Printf("  %s\n", dim.Render("💡 AI analysis available — run: yoke ai "+r.Domain))
		fmt.Printf("  %s\n\n", dim.Render("   Requires an OpenRouter key. See: yoke ai --setup"))
	}
}

func sortedAxes(axes map[string]AxisVal) []string {
	order := []string{"security", "performance", "reliability", "trust", "visibility"}
	var result []string
	for _, name := range order {
		if _, ok := axes[name]; ok {
			result = append(result, name)
		}
	}
	for name := range axes {
		found := false
		for _, r := range result {
			if r == name {
				found = true
				break
			}
		}
		if !found {
			result = append(result, name)
		}
	}
	return result
}

// ─── Text Helpers ───────────────────────────────────────────────────

// normalizeDomain extracts a clean domain from user input, stripping
// schemes (http/https), paths, port numbers, and whitespace.
func normalizeDomain(raw string) string {
	d := strings.ToLower(strings.TrimSpace(raw))
	// Strip common URL schemes
	d = strings.TrimPrefix(d, "https://")
	d = strings.TrimPrefix(d, "http://")
	// Strip paths and fragments
	if i := strings.IndexAny(d, "/?#"); i != -1 {
		d = d[:i]
	}
	// Strip port numbers (e.g., example.com:8080)
	if host, _, found := strings.Cut(d, ":"); found {
		d = host
	}
	// Strip trailing dots and slashes
	d = strings.TrimRight(d, "./")
	return d
}

func wrapText(text string, width int) []string {
	var lines []string
	for _, para := range strings.Split(text, "\n") {
		words := strings.Fields(para)
		if len(words) == 0 {
			lines = append(lines, "")
			continue
		}
		line := words[0]
		for _, w := range words[1:] {
			if len(line)+1+len(w) > width {
				lines = append(lines, line)
				line = w
			} else {
				line += " " + w
			}
		}
		lines = append(lines, line)
	}
	return lines
}

// ─── Commands ───────────────────────────────────────────────────────

var jsonOutput bool

func main() {
	// Initialize API base URL from config/env (supports self-hosting)
	cfg := loadConfig()
	apiBase = resolveBaseURL(cfg)

	root := &cobra.Command{
		Use:   "yoke <domain>",
		Short: "Domain intelligence from your terminal",
		Long: accent.Render("Yoke") + " — domain intelligence from your terminal\n\n" +
			"Analyze any domain instantly: DNS, SSL, WHOIS, security headers,\n" +
			"tech stack, performance, breaches, and more.\n\n" +
			dim.Render("https://yoke.lol"),
		Version: version,
		Args: func(cmd *cobra.Command, args []string) error {
			if len(args) == 0 {
				cmd.Help()
				os.Exit(0)
			}
			return cobra.ExactArgs(1)(cmd, args)
		},
		RunE:    runAnalyze,
		SilenceUsage: true,
		Example: `  yoke stripe.com                        # full analysis
  yoke stripe.com --json                 # raw JSON output
  yoke stripe.com --json | jq .ssl       # extract specific fields
  yoke score google.com                  # quick score check
  yoke compare github.com gitlab.com     # side-by-side comparison
  yoke ai stripe.com                     # AI-powered analysis`,
	}
	// Show help instead of bare error when no args provided
	root.SetFlagErrorFunc(func(cmd *cobra.Command, err error) error {
		cmd.Help()
		return err
	})
	root.PersistentFlags().BoolVar(&jsonOutput, "json", false, "raw JSON output")

	score := &cobra.Command{
		Use:   "score <domain>",
		Short: "Quick score and grade",
		Args:  cobra.ExactArgs(1),
		RunE:  runScore,
	}

	compare := &cobra.Command{
		Use:   "compare <domain1> <domain2>",
		Short: "Side-by-side domain comparison",
		Args:  cobra.ExactArgs(2),
		RunE:  runCompare,
	}

	ai := &cobra.Command{
		Use:   "ai <domain>",
		Short: "AI-powered domain analysis (requires OpenRouter key)",
		Args:  cobra.MaximumNArgs(1),
		RunE:  runAI,
	}
	ai.Flags().Bool("setup", false, "configure your OpenRouter API key")
	ai.Flags().String("model", "", "model override (e.g. openai/gpt-4o, google/gemini-2.5-pro)")

	configCmd := &cobra.Command{
		Use:   "config",
		Short: "Show or edit configuration",
		RunE:  runConfig,
	}
	configCmd.Flags().String("set-key", "", "set OpenRouter API key")
	configCmd.Flags().String("set-model", "", "set default AI model (e.g. openai/gpt-4o, google/gemini-2.5-pro)")
	configCmd.Flags().String("set-base-url", "", "set Yoke instance URL for self-hosting (default: https://yoke.lol)")
	configCmd.Flags().Bool("suppress-ai-hint", false, "hide the AI hint from analyze output")
	configCmd.Flags().Bool("show-ai-hint", false, "re-enable the AI hint")

	root.AddCommand(score, compare, ai, configCmd)
	root.CompletionOptions.DisableDefaultCmd = true
	root.SetVersionTemplate("yoke {{.Version}}\n")

	if err := root.Execute(); err != nil {
		os.Exit(1)
	}
}

func runAnalyze(cmd *cobra.Command, args []string) error {
	domain := normalizeDomain(args[0])

	if jsonOutput {
		return printRawJSON(apiBase + "/" + domain)
	}

	result, err := fetchAnalysisStream(domain)
	if err != nil {
		return err
	}
	printAnalysis(result)
	return nil
}

func runScore(cmd *cobra.Command, args []string) error {
	domain := normalizeDomain(args[0])

	if jsonOutput {
		return printRawJSON(apiBase + "/" + domain)
	}

	result, err := fetchAnalysisStream(domain)
	if err != nil {
		return err
	}
	if result.Score == nil {
		fmt.Println(warn.Render("No score data"))
		return nil
	}
	grade := gradeStyle(result.Score.Grade).Bold(true).Render(result.Score.Grade)
	fmt.Printf("%s  %d/100  %s\n", title.Render(domain), result.Score.Composite, grade)
	return nil
}

func runCompare(cmd *cobra.Command, args []string) error {
	d1 := normalizeDomain(args[0])
	d2 := normalizeDomain(args[1])

	client := &http.Client{Timeout: 120 * time.Second}
	payloadBytes, _ := json.Marshal(map[string]string{"domain1": d1, "domain2": d2})
	req, err := http.NewRequest("POST", apiBase+"/api/compare", strings.NewReader(string(payloadBytes)))
	if err != nil {
		return fmt.Errorf("request setup failed: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "yoke-cli/"+version)

	spin := startSpinner(fmt.Sprintf("Comparing %s vs %s...", d1, d2))
	resp, err := client.Do(req)
	if err != nil {
		spin.stop()
		return fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxResponseBytes))
	spin.stop()
	if err != nil {
		return fmt.Errorf("read failed: %w", err)
	}

	if resp.StatusCode != 200 {
		if jsonOutput {
			os.Stdout.Write(body)
			if len(body) > 0 && body[len(body)-1] != '\n' {
				fmt.Println()
			}
			return fmt.Errorf("API error %d", resp.StatusCode)
		}
		return fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
	}

	if jsonOutput {
		os.Stdout.Write(body)
		if len(body) > 0 && body[len(body)-1] != '\n' {
			fmt.Println()
		}
		return nil
	}

	var data struct {
		Domain1 struct {
			Domain string      `json:"domain"`
			Score  *ScoreBlock `json:"domain_score"`
		} `json:"domain1"`
		Domain2 struct {
			Domain string      `json:"domain"`
			Score  *ScoreBlock `json:"domain_score"`
		} `json:"domain2"`
		Comparison struct {
			Axes []struct {
				Axis   string `json:"axis"`
				Score1 int    `json:"score1"`
				Score2 int    `json:"score2"`
				Delta  int    `json:"delta"`
			} `json:"axes"`
		} `json:"comparison"`
	}
	if err := json.Unmarshal(body, &data); err != nil {
		return fmt.Errorf("parse failed: %w", err)
	}

	fmt.Println()
	if data.Domain1.Score != nil {
		g1 := gradeStyle(data.Domain1.Score.Grade).Bold(true).Render(data.Domain1.Score.Grade)
		fmt.Printf("  %s  %d/100 %s\n", title.Render(fmt.Sprintf("%-30s", data.Domain1.Domain)),
			data.Domain1.Score.Composite, g1)
	}
	if data.Domain2.Score != nil {
		g2 := gradeStyle(data.Domain2.Score.Grade).Bold(true).Render(data.Domain2.Score.Grade)
		fmt.Printf("  %s  %d/100 %s\n", title.Render(fmt.Sprintf("%-30s", data.Domain2.Domain)),
			data.Domain2.Score.Composite, g2)
	}
	fmt.Println()

	for _, ax := range data.Comparison.Axes {
		deltaStr := fmt.Sprintf("%+d", ax.Delta)
		style := dim
		if ax.Delta > 0 {
			style = good
		} else if ax.Delta < 0 {
			style = bad
		}
		fmt.Printf("  %s  %3d vs %-3d  %s\n",
			axisName.Render(strings.ToUpper(ax.Axis)),
			ax.Score1, ax.Score2, style.Render(deltaStr))
	}

	fmt.Println()
	fmt.Printf("  %s\n\n", dim.Render(fmt.Sprintf("%s/compare/%s/%s", apiBase, d1, d2)))
	return nil
}

func runAI(cmd *cobra.Command, args []string) error {
	setup, _ := cmd.Flags().GetBool("setup")
	if setup {
		return runAISetup()
	}

	if len(args) == 0 {
		return fmt.Errorf("domain required: yoke ai <domain>")
	}

	domain := normalizeDomain(args[0])
	cfg := loadConfig()

	if cfg.OpenRouterKey == "" {
		fmt.Println()
		fmt.Println(warn.Render("  AI analysis requires an OpenRouter API key."))
		fmt.Println()
		fmt.Println("  1. Get a key at " + accent.Render("https://openrouter.ai/keys"))
		fmt.Println("  2. Run: " + title.Render("yoke ai --setup"))
		fmt.Println()
		fmt.Println(dim.Render("  Free tier includes 10 analyses/hour on yoke.lol without a key."))
		fmt.Println()
		return nil
	}

	model, _ := cmd.Flags().GetString("model")
	if model == "" {
		model = cfg.DefaultModel
	}

	// POST /api/ai-analysis with BYO key
	client := &http.Client{Timeout: 120 * time.Second}
	payload := map[string]string{"domain": domain}
	if model != "" {
		payload["model"] = model
	}
	payloadBytes, _ := json.Marshal(payload)

	req, err := http.NewRequest("POST", apiBase+"/api/ai-analysis", strings.NewReader(string(payloadBytes)))
	if err != nil {
		return fmt.Errorf("request setup failed: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "yoke-cli/"+version)
	req.Header.Set("X-OpenRouter-Key", cfg.OpenRouterKey)

	if jsonOutput {
		resp, err := client.Do(req)
		if err != nil {
			return fmt.Errorf("request failed: %w", err)
		}
		defer resp.Body.Close()
		body, err := io.ReadAll(io.LimitReader(resp.Body, maxResponseBytes))
		if err != nil {
			return fmt.Errorf("read failed: %w", err)
		}
		os.Stdout.Write(body)
		if len(body) > 0 && body[len(body)-1] != '\n' {
			fmt.Println()
		}
		if resp.StatusCode != 200 {
			return fmt.Errorf("API error %d", resp.StatusCode)
		}
		return nil
	}

	spin := startSpinner("Running AI analysis on " + domain + "...")

	resp, err := client.Do(req)
	if err != nil {
		spin.stop()
		return fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxResponseBytes))
	spin.stop()
	if err != nil {
		return fmt.Errorf("read failed: %w", err)
	}

	if resp.StatusCode == 429 {
		var rl struct {
			Limit int    `json:"limit"`
			Used  int    `json:"used"`
			Reset string `json:"reset"`
		}
		json.Unmarshal(body, &rl)
		fmt.Println()
		fmt.Println(warn.Render(fmt.Sprintf("  Rate limited: %d/%d used. Resets in %s.", rl.Used, rl.Limit, rl.Reset)))
		fmt.Println(dim.Render("  Add your own key with: yoke ai --setup"))
		fmt.Println()
		return nil
	}

	if resp.StatusCode != 200 {
		return fmt.Errorf("AI API error %d: %s", resp.StatusCode, string(body))
	}

	// Parse the AI response
	var aiResp struct {
		Result struct {
			Summary        string            `json:"summary"`
			Posture        string            `json:"posture"`
			KeyFindings    []json.RawMessage `json:"key_findings"`
			Recommendations []json.RawMessage `json:"recommendations"`
			PersonaInsights map[string]string `json:"persona_insights"`
		} `json:"result"`
		AnalyzedAt string `json:"analyzed_at"`
		Cached     bool   `json:"cached"`
	}
	if err := json.Unmarshal(body, &aiResp); err != nil {
		return fmt.Errorf("parse failed: %w", err)
	}

	r := aiResp.Result

	// Posture badge
	postureStyle := good
	switch r.Posture {
	case "poor":
		postureStyle = warn
	case "critical":
		postureStyle = bad
	case "fair":
		postureStyle = info
	}

	fmt.Println()
	fmt.Printf("  %s  %s\n", title.Render(domain), postureStyle.Bold(true).Render(strings.ToUpper(r.Posture)))
	fmt.Println()

	// Summary
	if r.Summary != "" {
		for _, line := range wrapText(r.Summary, 72) {
			fmt.Printf("  %s\n", line)
		}
		fmt.Println()
	}

	// Key findings
	if len(r.KeyFindings) > 0 {
		fmt.Println("  " + title.Render("Key Findings"))
		for _, raw := range r.KeyFindings {
			var f struct {
				Category string `json:"category"`
				Finding  string `json:"finding"`
				Severity string `json:"severity"`
				Action   string `json:"action"`
			}
			json.Unmarshal(raw, &f)
			icon := severityIcon(f.Severity)
			fmt.Printf("  %s %s\n", icon, f.Finding)
			if f.Action != "" {
				fmt.Printf("    %s\n", dim.Render("→ "+f.Action))
			}
		}
		fmt.Println()
	}

	// Recommendations
	if len(r.Recommendations) > 0 {
		fmt.Println("  " + title.Render("Recommendations"))
		for _, raw := range r.Recommendations {
			var rec struct {
				Priority int    `json:"priority"`
				Action   string `json:"action"`
				Impact   string `json:"impact"`
				Effort   string `json:"effort"`
			}
			json.Unmarshal(raw, &rec)
			effortBadge := dim.Render("[" + rec.Effort + "]")
			fmt.Printf("  %s. %s %s\n", accent.Render(fmt.Sprintf("%d", rec.Priority)), rec.Action, effortBadge)
			if rec.Impact != "" {
				fmt.Printf("     %s\n", dim.Render(rec.Impact))
			}
		}
		fmt.Println()
	}

	if aiResp.Cached {
		fmt.Printf("  %s\n", dim.Render("(cached result)"))
	}
	if model != "" {
		fmt.Printf("  %s\n", dim.Render("Model: "+model))
	}
	fmt.Printf("  %s\n\n", dim.Render(apiBase+"/"+domain))

	// Suppress the hint now that they've used AI
	if !cfg.SuppressAIHint {
		cfg.SuppressAIHint = true
		saveConfig(cfg)
	}

	return nil
}

func runAISetup() error {
	cfg := loadConfig()

	fmt.Println()
	fmt.Println(title.Render("  AI Analysis Setup"))
	fmt.Println()
	fmt.Println("  Yoke uses OpenRouter to power AI domain analysis.")
	fmt.Println("  Your key is stored locally in " + dim.Render(configPath()))
	fmt.Println()
	fmt.Println("  1. Get a key at " + accent.Render("https://openrouter.ai/keys"))
	fmt.Print("  2. Paste your key: ")

	scanner := bufio.NewScanner(os.Stdin)
	scanner.Scan()
	key := strings.TrimSpace(scanner.Text())

	if key == "" {
		fmt.Println(warn.Render("  No key provided. Setup cancelled."))
		return nil
	}

	cfg.OpenRouterKey = key
	cfg.SuppressAIHint = true
	saveConfig(cfg)

	fmt.Println()
	fmt.Println(good.Render("  ✓ Key saved. Try: yoke ai stripe.com"))
	fmt.Println()
	return nil
}

func runConfig(cmd *cobra.Command, args []string) error {
	cfg := loadConfig()

	setKey, _ := cmd.Flags().GetString("set-key")
	setModel, _ := cmd.Flags().GetString("set-model")
	setBaseURL, _ := cmd.Flags().GetString("set-base-url")
	suppressHint, _ := cmd.Flags().GetBool("suppress-ai-hint")
	showHint, _ := cmd.Flags().GetBool("show-ai-hint")

	changed := false

	if setKey != "" {
		cfg.OpenRouterKey = setKey
		cfg.SuppressAIHint = true
		changed = true
		fmt.Println(good.Render("✓ OpenRouter key saved"))
	}
	if setModel != "" {
		cfg.DefaultModel = setModel
		changed = true
		fmt.Println(good.Render("✓ Default model set to " + setModel))
	}
	if setBaseURL != "" {
		cfg.BaseURL = strings.TrimRight(strings.TrimSpace(setBaseURL), "/")
		changed = true
		fmt.Println(good.Render("✓ Base URL set to " + cfg.BaseURL))
		fmt.Println(dim.Render("  Restart CLI or set YOKE_BASE_URL env var to apply immediately"))
	}
	if suppressHint {
		cfg.SuppressAIHint = true
		changed = true
		fmt.Println(good.Render("✓ AI hint suppressed"))
	}
	if showHint {
		cfg.SuppressAIHint = false
		changed = true
		fmt.Println(good.Render("✓ AI hint re-enabled"))
	}

	if changed {
		saveConfig(cfg)
		return nil
	}

	// Show current config
	fmt.Println()
	fmt.Println(title.Render("  Configuration") + "  " + dim.Render(configPath()))
	fmt.Println()
	if cfg.OpenRouterKey != "" {
		masked := cfg.OpenRouterKey
		if len(masked) > 12 {
			masked = masked[:8] + "..." + masked[len(masked)-4:]
		}
		fmt.Printf("  OpenRouter key:  %s\n", masked)
	} else {
		fmt.Printf("  OpenRouter key:  %s\n", dim.Render("not set"))
	}
	if cfg.DefaultModel != "" {
		fmt.Printf("  Default model:   %s\n", cfg.DefaultModel)
	} else {
		fmt.Printf("  Default model:   %s\n", dim.Render("not set"))
	}
	if cfg.BaseURL != "" {
		fmt.Printf("  Base URL:        %s\n", cfg.BaseURL)
	} else {
		fmt.Printf("  Base URL:        %s\n", dim.Render("https://yoke.lol (default)"))
	}
	if envURL := os.Getenv("YOKE_BASE_URL"); envURL != "" {
		fmt.Printf("  (env override:  %s)\n", envURL)
	}
	fmt.Printf("  AI hint:         %s\n", map[bool]string{true: "suppressed", false: "shown"}[cfg.SuppressAIHint])
	fmt.Println()
	return nil
}

func printRawJSON(url string) error {
	client := &http.Client{Timeout: 90 * time.Second}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return fmt.Errorf("request setup failed: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "yoke-cli/"+version)

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxResponseBytes))
	if err != nil {
		return err
	}
	os.Stdout.Write(body)
	// Ensure output ends with newline
	if len(body) > 0 && body[len(body)-1] != '\n' {
		fmt.Println()
	}
	if resp.StatusCode != 200 {
		return fmt.Errorf("API error %d", resp.StatusCode)
	}
	return nil
}
