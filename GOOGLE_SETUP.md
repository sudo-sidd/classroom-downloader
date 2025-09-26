# Google Cloud Console Setup Instructions

## The Issue: redirect_uri_mismatch

The error you're seeing (`Error 400: redirect_uri_mismatch`) occurs because the redirect URI used by the application doesn't match what's configured in your Google Cloud Console OAuth application.

## Required Steps:

### 1. Go to Google Cloud Console
1. Visit: https://console.cloud.google.com/
2. Select your project (or create a new one)
3. Go to "APIs & Services" > "Credentials"

### 2. Configure OAuth 2.0 Client ID
1. Find your OAuth 2.0 Client ID (or create one if it doesn't exist)
2. Click "Edit" on your OAuth client
3. In the "Authorized redirect URIs" section, add these EXACT URIs:
   ```
   http://localhost:8080/
   http://127.0.0.1:8080/
   urn:ietf:wg:oauth:2.0:oob
   ```

### 3. Enable Required APIs
Make sure these APIs are enabled in your project:
1. Go to "APIs & Services" > "Library"
2. Search for and enable:
   - **Google Classroom API**
   - **Google Drive API**

### 4. OAuth Consent Screen
1. Go to "APIs & Services" > "OAuth consent screen"
2. Configure it as "External" (unless you have a Google Workspace)
3. Add your email as a test user
4. Add these scopes:
   - `https://www.googleapis.com/auth/classroom.courses.readonly`
   - `https://www.googleapis.com/auth/classroom.coursework.students.readonly`
   - `https://www.googleapis.com/auth/classroom.coursework.me.readonly`
   - `https://www.googleapis.com/auth/classroom.announcements.readonly`
   - `https://www.googleapis.com/auth/drive.readonly`
   - `https://www.googleapis.com/auth/drive.file`

### 5. Download Credentials
1. From the "Credentials" page, download your OAuth 2.0 Client credentials
2. Save the file as `credentials.json` in the `/projects/classroom-downloader/` directory

## After Setup:
1. Restart the Flask application
2. Try authentication again - it should now open a proper authorization window
3. The application will use `http://localhost:8080/` as the redirect URI

## Troubleshooting:
- Make sure the redirect URIs are exactly as shown above (including trailing slash for localhost)
- Ensure your credentials.json file is in the correct location
- Check that all required APIs are enabled
- If still having issues, try deleting the `token.json` file to force a fresh authentication

## Application Type:
When creating the OAuth client, choose **"Desktop application"** as the application type.
