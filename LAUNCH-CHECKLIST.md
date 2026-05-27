# Yoke Launch Checklist
# Target: Monday June 23, 2026 @ 10:00 AM PT (NRD 30-day cooloff from 5/22 registration)

---

## ✅ EMAIL

- [x] Resend account set up
- [x] DNS records (DKIM/SPF/MX) configured in Cloudflare
- [x] hello@yoke.lol working
- [x] Gmail "send as" hello@yoke.lol configured

---

## 🔲 SOCIAL HANDLES

- [x] **Bluesky** — yokelol.bsky.social ✅
- [x] **Reddit** — u/yokelol ✅
- [x] **Mastodon** — @yokelol@mastodon.social ✅
- [x] **X/Twitter** — @yokedotlol ✅ (yokelol taken)
- [ ] Set all bios to: "Domain intelligence in one pass. Free & open source." + link to yoke.lol
- [ ] Set all profile pics to ox mark
- [x] **Instagram** — @yokedotlol ✅
- [x] **Threads** — @yokedotlol ✅
- [x] **GitHub org** — yokedotlol ✅ (domain verified, repo transferred)

---

## 🔲 NRD (Newly Registered Domain) HEAT

- [ ] Check when yoke.lol was registered (`whois yoke.lol | grep -i creat`)
- [ ] Confirm domain age > 30 days before posting links on socials (LinkedIn, X, etc.)
- [ ] If under 30 days: delay launch or accept possible link flagging
- [ ] Note: LinkedIn is more aggressive than most about NRD link suppression

---

## ✅ LINKEDIN CAROUSEL

- [x] 6 slides designed and approved
- [x] PDF at `workspace/your_files/linkedin-carousel/yoke-launch-carousel.pdf`

---

## ✅ LINKEDIN POST COPY

- [x] Approved at `workspace/yoke-public/linkedin-launch-post.md`
- [x] "Weekend project" framing ✅
- [x] Naming story (yoke = for those who pull the load, .lol = trogdor nod) ✅
- [x] No bare links in body ✅

---

## 🔲 LAUNCH DAY (Monday June 23, 10am PT)

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
- [x] GitHub repo public (yokedotlol/yoke, MIT)
- [x] install.sh working (yoke.lol/install.sh → GitHub)
- [x] JSON API live (curl yoke.lol/domain.com)
- [x] Go CLI built and tested
- [x] Code audit complete (all 28 items resolved)
- [x] CI/CD safety gates with smoke tests + auto-rollback
- [x] Scoring recalibrated
- [x] CHANGELOG.md created
- [x] deploy.sh in repo
- [x] Logo click → home page fix deployed
- [x] Social verification: rel="me" links live, VERIFIED badges working
- [x] Repo transferred to yokedotlol/yoke, all references updated
