# FINAL FIX for Google OAuth Authentication

## The Root Problem
Your Google Cloud Console OAuth client is configured as a **"Web application"** type, but:
- The out-of-band URI `urn:ietf:wg:oauth:2.0:oob` only works with **"Desktop application"** clients
- Web applications require explicit redirect URIs to be registered

## SOLUTION 1: Create Desktop Application Client (RECOMMENDED)

### Step 1: Create New OAuth Client
1. Go to: https://console.cloud.google.com/apis/credentials
2. Click "**+ CREATE CREDENTIALS**" > "**OAuth client ID**"
3. **Application type**: Select "**Desktop application**"
4. **Name**: "Classroom Downloader Desktop"
5. Click "**CREATE**"

### Step 2: Download New Credentials
1. Click "**DOWNLOAD JSON**" for your new desktop client
2. Save as `credentials.json` in `/projects/classroom-downloader/`
3. **Replace your existing credentials.json file**

### Step 3: Test Authentication
1. Delete any existing `token.json`: `rm token.json`
2. Refresh the web app at http://127.0.0.1:5000
3. Click "**Authenticate with Google**" - should work automatically!

---

## SOLUTION 2: Fix Your Existing Web Client

### Step 1: Add Redirect URI
1. Go to: https://console.cloud.google.com/apis/credentials
2. Find your existing OAuth client (ID: `891420061309-...`)
3. Click "**Edit**"
4. In "**Authorized redirect URIs**", add:
   ```
   http://localhost:8080
   http://127.0.0.1:8080
   ```
5. Click "**SAVE**"

### Step 2: Test Authentication
1. Delete any existing `token.json`: `rm token.json`
2. Refresh the web app at http://127.0.0.1:5000
3. Click "**Authenticate with Google**"

---

## Why This Happens
- **Desktop applications** can use `urn:ietf:wg:oauth:2.0:oob` for out-of-band authentication
- **Web applications** must use HTTP redirect URIs that are explicitly registered
- Google enforces this for security reasons

## Current App Status
✅ **App running** on http://127.0.0.1:5000
✅ **Both authentication methods** supported (automatic + manual)
✅ **Temporary web server** ready to catch OAuth callbacks

## Quick Test
Try **Solution 1** first (desktop client) - it's the simplest and most reliable approach.
