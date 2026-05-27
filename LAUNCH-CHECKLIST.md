# Yoke Launch Checklist
# Target: Wednesday May 28, 2026 @ 10:00 AM PT (pending NRD timing)

---

## 🔲 EMAIL (do first — needed for social signups)

- [ ] Sign up for Resend (resend.com) — free tier, 100 emails/day
- [ ] Add yoke.lol domain in Resend dashboard
- [ ] Add DKIM records to CF DNS (Resend provides exact values)
- [ ] Verify SPF record includes Resend (or update existing)
- [ ] Set up hello@yoke.lol (or whatever address you want)
- [ ] Gmail → Settings → Accounts → "Send mail as" → add yoke.lol address with Resend SMTP creds
- [ ] Send test email, verify DKIM/SPF passes (check headers)

---

## 🔲 SOCIAL HANDLES (register @yokelol everywhere)

- [ ] **X/Twitter** — @yokelol (status unclear, try registering)
- [ ] **Instagram** — @yokelol
- [ ] **Threads** — @yokelol (auto-created with Instagram)
- [ ] **Bluesky** — yokelol.bsky.social (confirmed available)
- [ ] **Mastodon** — @yokelol@mastodon.social (confirmed available)
- [ ] **GitHub org** — github.com/yokelol (confirmed available; repo stays at kurtpayne/yoke)
- [ ] **Reddit** — u/yokelol (likely available)
- [ ] Set all bios to: "Domain intelligence in one pass. Free & open source." + link to yoke.lol
- [ ] Set all profile pics to ox mark

---

## 🔲 NRD (Newly Registered Domain) HEAT

- [ ] Check when yoke.lol was registered (`whois yoke.lol | grep -i creat`)
- [ ] Confirm domain age > 30 days before posting links on socials (LinkedIn, X, etc.)
- [ ] If under 30 days: delay launch or accept possible link flagging
- [ ] Note: LinkedIn is more aggressive than most about NRD link suppression

---

## 🔲 LINKEDIN CAROUSEL (review on filesystem)

- [ ] Review slides at `workspace/your_files/linkedin-carousel/slide1.png` through `slide6.png`
- [ ] Review/approve slide designs, copy, visual quality
- [ ] Iterate on any slides that need work
- [ ] Final PDF at `workspace/your_files/linkedin-carousel/yoke-launch-carousel.pdf`

---

## 🔲 LINKEDIN POST COPY (review on filesystem)

- [ ] Review at `workspace/yoke-public/linkedin-launch-post.md`
- [ ] Confirm "weekend project" framing
- [ ] Confirm naming story (yoke = for those who pull the load, .lol = trogdor nod)
- [ ] Confirm no bare links in body (all links in first comment only)
- [ ] Prep first comment text for quick paste after posting

---

## 🔲 LAUNCH DAY (Wednesday May 28, 10am PT)

- [ ] Final deploy of any pending code changes
- [ ] Purge CF cache
- [ ] Upload carousel PDF to LinkedIn as document post
- [ ] Paste post body
- [ ] Immediately post first comment with links
- [ ] Cross-post to social handles (short versions linking to LinkedIn post or yoke.lol)
- [ ] Post to Hacker News? (optional — "Show HN: Yoke – domain intelligence in one pass")
- [ ] Post to relevant subreddits? (r/selfhosted, r/webdev, r/sysadmin)
- [ ] Monitor comments, respond quickly (engagement in first hour = algorithmic boost)

---

## 🔲 ALREADY DONE ✅

- [x] Chrome extension live on Web Store
- [x] GitHub repo public (kurtpayne/yoke, MIT)
- [x] install.sh working (yoke.lol/install.sh → GitHub)
- [x] JSON API live (curl yoke.lol/domain.com)
- [x] Go CLI built and tested
- [x] Code audit complete (all 28 items resolved)
- [x] CI/CD safety gates with smoke tests + auto-rollback
- [x] Scoring recalibrated
- [x] CHANGELOG.md created
- [x] deploy.sh in repo
- [x] Logo click → home page fix deployed
