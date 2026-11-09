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
| `site/` | Single-page front end: home (word of the day, stats, recent, calendar), browse (time / kind / tag filters, sort, search, export), favorites, study (flashcards, Leitner review), card detail, device settings (`#/sync`); five color themes × light / dark |
| `data/sample-cards.json` | Fake sample cards for local preview |
| `.github/workflows/pages.yml` | Hourly / dispatch / push build and Pages deploy |

## Local preview

```sh
CARDS_PASSWORD=demo OUT_DIR=/tmp/ecprev node scripts/build.mjs --input data/sample-cards.json
python3 -m http.server 8777 -d /tmp/ecprev   # open http://localhost:8777, password "demo"
```

Node 18+ is required; there are no npm dependencies.

To preview with the real Sheet data, put `CARDS_API_URL` and `CARDS_API_KEY` in `.env` (git-ignored) and build without `--input`:

```sh
set -a; . ./.env; set +a
CARDS_PASSWORD=demo OUT_DIR=/tmp/ecprev node scripts/build.mjs
```

Bulk import from a JSON file (`{"cards": [...]}`) goes through the API, so duplicates merge and `created_at` is kept:

```sh
set -a; . ./.env; set +a
node scripts/import.mjs data/sample-cards.json
```

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

`id, term, aliases, kind (word/phrase/idiom/usage/group), pos, ipa, meaning_zh, meaning_en, entries, usage, examples, synonyms, antonyms, collocations, source, source_url, context, tags, note, status (new/learning/known), starred, created_at, updated_at`

List fields (`aliases, entries, examples, synonyms, antonyms, collocations, tags`) are newline-separated inside one cell; the API accepts and returns arrays.
`add` with a term that matches an existing term or alias merges into that card (lists are unioned, non-empty text replaces).
Review progress and favorites (★) are kept in each browser, not in the Sheet (the Sheet's `starred` is only the initial value).

`kind = group` is a Chinese-first card: `term` is a Chinese headword (e.g. 出局), `entries` lists English expressions, one per line, optionally `english — 中文说明`; examples are optional. `add` sets this kind automatically when the term contains Chinese.
Tags are English register / topic labels (spoken, written, research, cooking, paper, book…); `source` is the specific origin (paper title, book name) shown under the context, not a filter.

### 2. GitHub

Repository secrets: `CARDS_API_URL`, `CARDS_API_KEY`, `CARDS_PASSWORD` (the site password; changing it means each device enters the new one).
Settings → Pages → Source: **GitHub Actions**.

Optional instant rebuilds: create a fine-grained token with *Contents: read and write* on this repository and add Script Properties `GITHUB_TOKEN` and `GITHUB_REPO` (`owner/english-cards`). Each write then sends a `cards-updated` dispatch; otherwise the hourly run picks changes up.

## Updating and syncing

- **Auto-complete hand-added words**: when 同步 runs, rows that have a term but miss core content (Chinese meaning, or examples; English entries for Chinese headwords) are filled by OpenAI (`OPENAI_API_KEY` in Script Properties, model `OPENAI_MODEL`, default `gpt-5-mini`; at most 8 per click). Only empty cells are filled; filled cards get the hidden tag `ai-filled`. Complete cards never call the model, and scheduled builds never do. A word typed into the `id` column is moved to `term`. Hand-added rows can be inserted anywhere below the header (e.g. row 2); on 同步 they get an id and move to the bottom, keeping their order.

- **同步 button** (top bar): reads the Sheet directly in the browser (the API URL and key are inside the encrypted payload) and caches the cards on the device, then syncs favorites and review progress. Use it after editing the Sheet by hand or through ChatGPT's own Google connector.
- **Rebuilds**: writes through the API send `repository_dispatch` (about a minute); the hourly schedule catches everything else.
- **Favorites / review progress across devices**: open `?sync` (or 本机设置 in the footer), paste a GitHub token with only the `gist` scope once per device; data goes to a private gist `english-cards-sync.json`.

## Security notes

- The site, its code and the encrypted file are public; card text is not readable without the password. Use a long password: anyone can download the encrypted file and try passwords offline.
- The Apps Script key grants read and write access to all cards. It is kept in GitHub secrets, the GPT Action if any, and inside the encrypted payload for the 同步 button — so the site password also protects write access.
- The page stores the password in `localStorage` on devices where it was entered; use "Sign out" on shared machines.
