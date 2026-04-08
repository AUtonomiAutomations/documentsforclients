# Setup Guide

## 1. Google Drive — Service Account

### Create the service account

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or select an existing one)
3. Search for **"Google Drive API"** → Enable it
4. Go to **IAM & Admin → Service Accounts → Create Service Account**
   - Name: `transcript-to-docs`
   - Click **Done** (no roles needed)
5. Click the new service account → **Keys** tab → **Add Key → JSON**
   - A `.json` file downloads — keep it safe, never commit it

### Share your Drive folder

6. Open your Google Drive → find the **"Leads"** folder
7. Right-click → **Share** → paste the service account email (looks like `transcript-to-docs@your-project.iam.gserviceaccount.com`) → give it **Editor** access

### Add to environment variables

8. Open the downloaded `.json` file, copy its entire content
9. Minify it to one line (you can use https://jsonformatter.org/json-minify)
10. Set it as `GOOGLE_SERVICE_ACCOUNT_JSON` in your `.env` and in Netlify

---

## 2. Environment Variables

Copy `.env.example` to `.env` and fill in all values:

| Variable | Where to find it |
|---|---|
| `FIREFLIES_API_KEY` | Fireflies → Settings → API |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys |
| `MONDAY_API_TOKEN` | Monday.com → Profile → Developer → API v2 token |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | See step above (one-line JSON) |
| `WEBHOOK_SECRET` | Make up any random string, put the same in Make.com |

---

## 3. Deploy to Netlify

```bash
# 1. Push to GitHub
git init
git add .
git commit -m "initial commit"
gh repo create transcript-to-docs --private --push --source=.

# 2. Connect to Netlify
# Go to app.netlify.com → Add new site → Import from GitHub → select the repo
# Build command: npm install
# Publish directory: public

# 3. Set env vars in Netlify
# Site settings → Environment variables → add all vars from .env
```

---

## 4. Make.com Webhook Setup

1. Create a new scenario in Make.com
2. Add a **Webhooks → Custom Webhook** module as the trigger
3. Set the webhook URL to:
   ```
   https://YOUR-NETLIFY-SITE.netlify.app/.netlify/functions/process-transcript-background
   ```
4. Add a header: `x-webhook-secret: <your WEBHOOK_SECRET>`
5. The payload should be:
   ```json
   {
     "transcript_id": "{{transcript_id}}",
     "meeting_url": "{{meeting_url}}"
   }
   ```

---

## 5. Local Development

```bash
npm install
cp .env.example .env   # fill in your values
npm run dev            # starts netlify dev on port 8888
```

Test locally:
```bash
curl -X POST http://localhost:8888/.netlify/functions/process-transcript-background \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: your_secret" \
  -d '{"transcript_id":"abc123","meeting_url":"https://zoom.us/j/123456789"}'
```
