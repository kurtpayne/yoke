package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/charmbracelet/lipgloss"
	"github.com/spf13/cobra"
)

var version = "dev"

var apiBase string

// ─── Config ─────────────────────────────────────────────────────────

type Config struct {
	OpenRouterKey  string `json:"openrouter_key"`
	SuppressAIHint bool   `json:"suppress_ai_hint"`
	DefaultModel   string `json:"default_model,omitempty"`
	BaseURL        string `json:"base_url,omitempty"`
}

const defaultBaseURL = "https://yoke.lol"

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
	return filepath.Join(home, ".yokerc")
}

func loadConfig() Config {
	var cfg Config
	data, err := os.ReadFile(configPath())
	if err != nil {
		return cfg
	}
	json.Unmarshal(data, &cfg)
	return cfg
}

func saveConfig(cfg Config) {
	data, _ := json.MarshalIndent(cfg, "", "  ")
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
	client := &http.Client{Timeout: 45 * time.Second}
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

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read failed: %w", err)
	}
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
	}
	return body, nil
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
		facts = append(facts, fmt.Sprintf("LCP %.1fs", r.Performance.LCP))
	}
	if len(facts) > 0 {
		lines = append(lines, dim.Render(strings.Join(facts, " · ")))
		lines = append(lines, "")
	}

	// Key findings
	var goods, issues []Finding
	for _, name := range sortedAxes(r.Score.Axes) {
		for _, f := range r.Score.Axes[name].Findings {
			switch f.Severity {
			case "good":
				goods = append(goods, f)
			case "critical", "high", "medium":
				issues = append(issues, f)
			}
		}
	}

	if len(issues) > 0 || len(goods) > 0 {
		lines = append(lines, title.Render("Findings"))
		for _, f := range issues {
			lines = append(lines, fmt.Sprintf("%s %s", severityIcon(f.Severity), f.Label))
		}
		cap := 5
		if len(goods) < cap {
			cap = len(goods)
		}
		for _, f := range goods[:cap] {
			lines = append(lines, fmt.Sprintf("%s %s", severityIcon(f.Severity), f.Label))
		}
		if len(goods) > 5 {
			lines = append(lines, dim.Render(fmt.Sprintf("+%d more passing", len(goods)-5)))
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
		Use:     "yoke <domain>",
		Short:   "Domain intelligence from your terminal",
		Long:    "Analyze any domain instantly — DNS, SSL, WHOIS, security, performance, and more.\nhttps://yoke.lol",
		Version: version,
		Args:    cobra.ExactArgs(1),
		RunE:    runAnalyze,
		Example: `  yoke stripe.com
  yoke stripe.com --json
  yoke stripe.com --json | jq .ssl
  yoke score google.com
  yoke compare github.com gitlab.com
  yoke ai stripe.com`,
	}
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
	domain := strings.ToLower(strings.TrimSpace(args[0]))

	if jsonOutput {
		return printRawJSON(apiBase + "/" + domain)
	}

	result, err := fetchAnalysis(domain)
	if err != nil {
		return err
	}
	printAnalysis(result)
	return nil
}

func runScore(cmd *cobra.Command, args []string) error {
	domain := strings.ToLower(strings.TrimSpace(args[0]))
	result, err := fetchAnalysis(domain)
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
	d1 := strings.ToLower(strings.TrimSpace(args[0]))
	d2 := strings.ToLower(strings.TrimSpace(args[1]))

	client := &http.Client{Timeout: 45 * time.Second}
	payload := fmt.Sprintf(`{"domain1":"%s","domain2":"%s"}`, d1, d2)
	req, _ := http.NewRequest("POST", apiBase+"/api/compare", strings.NewReader(payload))
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "yoke-cli/"+version)

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	if jsonOutput {
		var buf interface{}
		json.Unmarshal(body, &buf)
		out, _ := json.MarshalIndent(buf, "", "  ")
		fmt.Println(string(out))
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
	json.Unmarshal(body, &data)

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

	domain := strings.ToLower(strings.TrimSpace(args[0]))
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
	client := &http.Client{Timeout: 60 * time.Second}
	payload := map[string]string{"domain": domain}
	if model != "" {
		payload["model"] = model
	}
	payloadBytes, _ := json.Marshal(payload)

	req, _ := http.NewRequest("POST", apiBase+"/api/ai-analysis", strings.NewReader(string(payloadBytes)))
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
		body, _ := io.ReadAll(resp.Body)
		var buf interface{}
		json.Unmarshal(body, &buf)
		out, _ := json.MarshalIndent(buf, "", "  ")
		fmt.Println(string(out))
		return nil
	}

	fmt.Printf("\n  %s %s\n", accent.Render("⚡"), dim.Render("Analyzing "+domain+"..."))

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

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

	var key string
	fmt.Scanln(&key)
	key = strings.TrimSpace(key)

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
		masked := cfg.OpenRouterKey[:8] + "..." + cfg.OpenRouterKey[len(cfg.OpenRouterKey)-4:]
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
	client := &http.Client{Timeout: 45 * time.Second}
	req, _ := http.NewRequest("GET", url, nil)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "yoke-cli/"+version)

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	_, err = io.Copy(os.Stdout, resp.Body)
	return err
}
