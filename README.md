# English Cards

A personal English vocabulary site: words, phrases and usages collected in daily life, viewable and reviewable on desktop and phone.
Cards are written through a ChatGPT custom GPT (Actions) into a Google Sheet; GitHub Actions turns the Sheet into a static site on GitHub Pages.

The repository and the site are public, but **the card data is encrypted**: the build encrypts all cards with a password (AES-GCM, key from PBKDF2-SHA256), and the page decrypts them in the browser. Each device asks for the password once. Plain card data is never committed.

## How it works

```text
ChatGPT (custom GPT + Actions) ──add/update/search──▶ Apps Script Web App ──▶ Google Sheet
                                                         │ repository_dispatch (optional)
GitHub Actions (hourly + on dispatch) ──get──────────────┘
   └─ scripts/build.mjs: fetch cards → encrypt → _site/ → GitHub Pages
Browser: site/index.html + assets/app.js → fetch data/cards.enc.json → decrypt → render
```

No server and no model calls at build time.

## Repository layout

| Path | Purpose |
| --- | --- |
| `apps_script/Code.gs` | Web App bound to the Sheet: `get`, `search`, `add` (merges duplicates by term/aliases), `update`, `delete` |
| `scripts/build.mjs` | Fetch cards (or read `--input`), encrypt, write `_site/` |
| `site/` | Single-page front end: home (word of the day, stats, recent, calendar), browse, study (flashcards), card detail |
| `data/sample-cards.json` | Fake sample cards for local preview |
| `.github/workflows/pages.yml` | Hourly / dispatch / push build and Pages deploy |

## Local preview

```sh
CARDS_PASSWORD=demo OUT_DIR=/tmp/ecprev node scripts/build.mjs --input data/sample-cards.json
python3 -m http.server 8777 -d /tmp/ecprev   # open http://localhost:8777, password "demo"
```

Node 18+ is required; there are no npm dependencies.

## Setup

### 1. Google Sheet + Apps Script

1. Create a Google Sheet (any name). Open **Extensions → Apps Script**, replace `Code.gs` with `apps_script/Code.gs`, save.
2. Run the `setup` function once (authorize when asked). It creates the `cards` sheet with the header row and a random `API_KEY` in **Project Settings → Script Properties**; the key is printed in the execution log.
3. **Deploy → New deployment → Web app**: execute as *Me*, access *Anyone*. Copy the `/exec` URL.
   The key check in the script is what protects the data; "Anyone" is needed so ChatGPT and GitHub Actions can call it.
4. Test:

```sh
URL='https://script.google.com/macros/s/.../exec'; KEY='...'
curl -sL "$URL" -H 'Content-Type: text/plain' -d '{"key":"'$KEY'","action":"add","card":{"term":"serendipity","meaning_zh":"机缘巧合"}}'
curl -sL "$URL?key=$KEY&action=get"
```

After editing `Code.gs`, use **Deploy → Manage deployments → Edit → New version**, so the URL stays the same.

### Columns

`id, term, aliases, kind (word/phrase/idiom/usage), pos, ipa, meaning_zh, meaning_en, usage, examples, synonyms, antonyms, collocations, source, source_url, context, tags, note, status (new/learning/known), starred, created_at, updated_at`

List fields (`aliases, examples, synonyms, antonyms, collocations, tags`) are newline-separated inside one cell; the API accepts and returns arrays.
`add` with a term that matches an existing term or alias merges into that card (lists are unioned, non-empty text replaces).
Review progress is kept in each browser, not in the Sheet.

### 2. GitHub

Repository secrets: `CARDS_API_URL`, `CARDS_API_KEY`, `CARDS_PASSWORD` (the site password; changing it means each device enters the new one).
Settings → Pages → Source: **GitHub Actions**.

Optional instant rebuilds: create a fine-grained token with *Contents: read and write* on this repository and add Script Properties `GITHUB_TOKEN` and `GITHUB_REPO` (`owner/english-cards`). Each write then sends a `cards-updated` dispatch; otherwise the hourly run picks changes up.

## Security notes

- The site, its code and the encrypted file are public; card text is not readable without the password. Use a long password: anyone can download the encrypted file and try passwords offline.
- The Apps Script key grants read and write access to all cards; keep it only in the GPT Action and GitHub secrets.
- The page stores the password in `localStorage` on devices where it was entered; use "Sign out" on shared machines.
