import { wantsJSON } from "@worker/spa";
import { describe, expect, it } from "vitest";

function req(accept: string, ua: string = ""): Request {
  const headers: Record<string, string> = {};
  if (accept) headers.Accept = accept;
  if (ua) headers["User-Agent"] = ua;
  return new Request("https://yoke.lol/stripe.com", { headers });
}

describe("wantsJSON – content negotiation", () => {
  // Browsers → HTML
  it("returns false for Accept: text/html", () => {
    expect(wantsJSON(req("text/html"))).toBe(false);
  });
  it("returns false for browser-style accept with text/html", () => {
    expect(wantsJSON(req("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"))).toBe(false);
  });

  // Explicit JSON → JSON
  it("returns true for Accept: application/json", () => {
    expect(wantsJSON(req("application/json"))).toBe(true);
  });

  // CLI tools → JSON
  it("returns true for curl", () => {
    expect(wantsJSON(req("*/*", "curl/8.4.0"))).toBe(true);
  });
  it("returns true for wget", () => {
    expect(wantsJSON(req("*/*", "Wget/1.21"))).toBe(true);
  });
  it("returns true for python-requests", () => {
    expect(wantsJSON(req("*/*", "python-requests/2.31.0"))).toBe(true);
  });

  // Link preview bots → HTML
  it("returns false for Signal-Desktop", () => {
    expect(wantsJSON(req("*/*", "Mozilla/5.0 Signal-Desktop/7.0.0 Chrome/120.0 Electron/28.0"))).toBe(false);
  });
  it("returns false for Signal-iOS", () => {
    expect(wantsJSON(req("*/*", "Signal-iOS/7.0.0"))).toBe(false);
  });
  it("returns false for Signal-Android", () => {
    expect(wantsJSON(req("*/*", "Signal-Android/7.0.0"))).toBe(false);
  });
  it("returns false for WhatsApp", () => {
    expect(wantsJSON(req("*/*", "WhatsApp/2.23.0"))).toBe(false);
  });
  it("returns false for Slackbot", () => {
    expect(wantsJSON(req("*/*", "Slackbot-LinkExpanding 1.0"))).toBe(false);
  });
  it("returns false for TelegramBot", () => {
    expect(wantsJSON(req("*/*", "TelegramBot (like TwitterBot)"))).toBe(false);
  });
  it("returns false for Discordbot", () => {
    expect(wantsJSON(req("*/*", "Mozilla/5.0 (compatible; Discordbot/2.0)"))).toBe(false);
  });
  it("returns false for LinkedInBot", () => {
    expect(wantsJSON(req("*/*", "LinkedInBot/1.0"))).toBe(false);
  });
  it("returns false for Twitterbot", () => {
    expect(wantsJSON(req("*/*", "Twitterbot/1.0"))).toBe(false);
  });
  it("returns false for facebookexternalhit", () => {
    expect(wantsJSON(req("*/*", "facebookexternalhit/1.1"))).toBe(false);
  });
  it("returns false for Instagrambot", () => {
    expect(wantsJSON(req("*/*", "Mozilla/5.0 (compatible; Instagrambot/1.0)"))).toBe(false);
  });
  it("returns false for Instagram in-app browser (FBAN)", () => {
    expect(
      wantsJSON(
        req(
          "*/*",
          "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) Mobile/20G75 [FBAN/FBIOS;FBAV/428.0.0.38.109]",
        ),
      ),
    ).toBe(false);
  });
  it("returns false for Googlebot", () => {
    expect(wantsJSON(req("*/*", "Mozilla/5.0 (compatible; Googlebot/2.1)"))).toBe(false);
  });
  it("returns false for Bingbot", () => {
    expect(wantsJSON(req("*/*", "Mozilla/5.0 (compatible; bingbot/2.0)"))).toBe(false);
  });

  // Unknown */* → JSON (preserves curl API default)
  it("returns true for unknown UA with */*", () => {
    expect(wantsJSON(req("*/*", "some-random-tool/1.0"))).toBe(true);
  });
  it("returns true for empty accept and empty UA", () => {
    expect(wantsJSON(req("", ""))).toBe(true);
  });
});
