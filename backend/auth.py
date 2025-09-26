import os
import json
import logging
import threading
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from typing import Optional
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError


class AuthCallbackHandler(BaseHTTPRequestHandler):
    """Simple HTTP handler to catch OAuth callback."""
    
    def do_GET(self):
        """Handle GET request with authorization code."""
        try:
            parsed_path = urlparse(self.path)
            query_params = parse_qs(parsed_path.query)
            
            if 'code' in query_params:
                self.server.auth_code = query_params['code'][0]
                self.send_response(200)
                self.send_header('Content-type', 'text/html')
                self.end_headers()
                self.wfile.write(b'''
                    <html>
                        <head><title>Authorization Successful</title></head>
                        <body>
                            <h1>Authorization Successful!</h1>
                            <p>You can now close this window and return to the application.</p>
                            <script>window.close();</script>
                        </body>
                    </html>
                ''')
            else:
                self.send_response(400)
                self.send_header('Content-type', 'text/html')
                self.end_headers()
                self.wfile.write(b'''
                    <html>
                        <head><title>Authorization Failed</title></head>
                        <body>
                            <h1>Authorization Failed</h1>
                            <p>No authorization code received.</p>
                        </body>
                    </html>
                ''')
        except Exception as e:
            logging.error(f"Error in auth callback: {e}")
            self.send_response(500)
            self.end_headers()
    
    def log_message(self, format, *args):
        """Suppress default logging."""
        pass


class GoogleAPIAuth:
    """Handles Google API authentication and service creation."""
    
    # OAuth 2.0 scopes for Google Classroom and Drive APIs
    SCOPES = [
        'https://www.googleapis.com/auth/classroom.courses.readonly',
        'https://www.googleapis.com/auth/classroom.coursework.students.readonly',
        'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
        'https://www.googleapis.com/auth/classroom.announcements.readonly',
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/drive.file'
    ]
    
    def __init__(self, credentials_file: str = 'credentials.json', token_file: str = 'token.json'):
        """Initialize with credentials and token file paths."""
        self.credentials_file = credentials_file
        self.token_file = token_file
        self.creds: Optional[Credentials] = None
        self._classroom_service = None
        self._drive_service = None
        
    def authenticate(self) -> bool:
        """Authenticate with Google APIs using OAuth2."""
        try:
            # Load existing token if available
            if os.path.exists(self.token_file):
                self.creds = Credentials.from_authorized_user_file(self.token_file, self.SCOPES)
            
            # If there are no valid credentials, request authorization
            if not self.creds or not self.creds.valid:
                if self.creds and self.creds.expired and self.creds.refresh_token:
                    try:
                        self.creds.refresh(Request())
                        logging.info("Refreshed existing credentials")
                    except Exception as e:
                        logging.warning(f"Failed to refresh credentials: {e}")
                        self.creds = None
                
                if not self.creds:
                    if not os.path.exists(self.credentials_file):
                        logging.error(f"Credentials file not found: {self.credentials_file}")
                        return False
                    
                    # Try automatic authentication with temp server
                    logging.info("Attempting automatic authentication with temporary server")
                    success = self.authenticate_with_temp_server()
                    if success:
                        return True
                    else:
                        # Fall back to manual authentication
                        logging.info("Automatic authentication failed, falling back to manual flow")
                        return False  # This will trigger the manual authentication flow
                
                # Save credentials for next run
                with open(self.token_file, 'w') as token:
                    token.write(self.creds.to_json())
                logging.info(f"Saved credentials to {self.token_file}")
            
            return True
            
        except Exception as e:
            logging.error(f"Authentication failed: {e}")
            return False
    
    def get_auth_url(self) -> str:
        """Get the authorization URL for manual authentication."""
        try:
            if not os.path.exists(self.credentials_file):
                raise Exception("Credentials file not found")
            
            flow = InstalledAppFlow.from_client_secrets_file(
                self.credentials_file, self.SCOPES
            )
            
            # Use a proper redirect URI for web applications
            # This needs to be registered in Google Cloud Console
            flow.redirect_uri = 'http://localhost:8080'
            auth_url, _ = flow.authorization_url(
                prompt='consent',
                access_type='offline',
                include_granted_scopes='true'
            )
            
            # Store flow for later use
            self._temp_flow = flow
            
            return auth_url
            
        except Exception as e:
            logging.error(f"Failed to generate auth URL: {e}")
            raise
    
    def authenticate_with_temp_server(self) -> bool:
        """Authenticate using a temporary web server to catch the callback."""
        try:
            if not os.path.exists(self.credentials_file):
                logging.error("Credentials file not found")
                return False
            
            flow = InstalledAppFlow.from_client_secrets_file(
                self.credentials_file, self.SCOPES
            )
            
            # Start a temporary server on port 8080
            server = HTTPServer(('localhost', 8080), AuthCallbackHandler)
            server.auth_code = None
            
            # Start server in background thread
            server_thread = threading.Thread(target=server.serve_forever)
            server_thread.daemon = True
            server_thread.start()
            
            try:
                # Set redirect URI and get auth URL
                flow.redirect_uri = 'http://localhost:8080'
                auth_url, _ = flow.authorization_url(
                    prompt='consent',
                    access_type='offline',
                    include_granted_scopes='true'
                )
                
                logging.info(f"Please visit this URL to authorize: {auth_url}")
                
                # Wait for the authorization code (timeout after 60 seconds)
                timeout = 60
                start_time = time.time()
                
                while server.auth_code is None and (time.time() - start_time) < timeout:
                    time.sleep(0.5)
                
                if server.auth_code:
                    # Exchange code for credentials
                    flow.fetch_token(code=server.auth_code)
                    self.creds = flow.credentials
                    
                    # Save credentials
                    with open(self.token_file, 'w') as token:
                        token.write(self.creds.to_json())
                    logging.info(f"Saved credentials to {self.token_file}")
                    
                    return True
                else:
                    logging.error("Authentication timeout - no authorization code received")
                    return False
                    
            finally:
                server.shutdown()
                server.server_close()
                
        except Exception as e:
            logging.error(f"Temp server authentication failed: {e}")
            return False
    
    def authenticate_with_code(self, auth_code: str) -> bool:
        """Complete authentication using authorization code."""
        try:
            if not hasattr(self, '_temp_flow'):
                raise Exception("No authentication flow in progress")
            
            # Exchange code for credentials
            self._temp_flow.fetch_token(code=auth_code)
            self.creds = self._temp_flow.credentials
            
            # Clean up temp flow
            delattr(self, '_temp_flow')
            
            # Save credentials
            with open(self.token_file, 'w') as token:
                token.write(self.creds.to_json())
            logging.info(f"Saved credentials to {self.token_file}")
            
            return True
            
        except Exception as e:
            logging.error(f"Failed to authenticate with code: {e}")
            return False
    
    def get_classroom_service(self):
        """Get authenticated Google Classroom service."""
        if not self._classroom_service:
            if not self.creds:
                if not self.authenticate():
                    raise Exception("Failed to authenticate with Google APIs")
            
            try:
                self._classroom_service = build('classroom', 'v1', credentials=self.creds)
                logging.info("Created Classroom service")
            except Exception as e:
                logging.error(f"Failed to create Classroom service: {e}")
                raise
        
        return self._classroom_service
    
    def get_drive_service(self):
        """Get authenticated Google Drive service."""
        if not self._drive_service:
            if not self.creds:
                if not self.authenticate():
                    raise Exception("Failed to authenticate with Google APIs")
            
            try:
                self._drive_service = build('drive', 'v3', credentials=self.creds)
                logging.info("Created Drive service")
            except Exception as e:
                logging.error(f"Failed to create Drive service: {e}")
                raise
        
        return self._drive_service
    
    def is_authenticated(self) -> bool:
        """Check if currently authenticated."""
        return self.creds is not None and self.creds.valid
    
    def revoke_credentials(self) -> bool:
        """Revoke stored credentials."""
        try:
            if os.path.exists(self.token_file):
                os.remove(self.token_file)
                logging.info("Removed token file")
            
            self.creds = None
            self._classroom_service = None
            self._drive_service = None
            return True
            
        except Exception as e:
            logging.error(f"Failed to revoke credentials: {e}")
            return False
    
    def test_connection(self) -> dict:
        """Test API connections and return status."""
        results = {
            'classroom': False,
            'drive': False,
            'errors': []
        }
        
        try:
            # Test Classroom API
            classroom = self.get_classroom_service()
            courses = classroom.courses().list(pageSize=1).execute()
            results['classroom'] = True
            logging.info("Classroom API connection successful")
            
        except HttpError as e:
            error_msg = f"Classroom API error: {e.resp.status} {e.resp.reason}"
            results['errors'].append(error_msg)
            logging.error(error_msg)
        except Exception as e:
            error_msg = f"Classroom API connection failed: {e}"
            results['errors'].append(error_msg)
            logging.error(error_msg)
        
        try:
            # Test Drive API
            drive = self.get_drive_service()
            about = drive.about().get(fields='user').execute()
            results['drive'] = True
            logging.info("Drive API connection successful")
            
        except HttpError as e:
            error_msg = f"Drive API error: {e.resp.status} {e.resp.reason}"
            results['errors'].append(error_msg)
            logging.error(error_msg)
        except Exception as e:
            error_msg = f"Drive API connection failed: {e}"
            results['errors'].append(error_msg)
            logging.error(error_msg)
        
        return results


def setup_credentials_template():
    """Create a template credentials.json file with instructions."""
    template = {
        "installed": {
            "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
            "project_id": "your-project-id",
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
            "client_secret": "YOUR_CLIENT_SECRET",
            "redirect_uris": [
                "http://localhost:8080",
                "http://127.0.0.1:8080",
                "http://localhost",
                "urn:ietf:wg:oauth:2.0:oob"
            ]
        }
    }
    
    instructions = """
# Google API Credentials Setup

This is a template credentials.json file. To use this application, you need to:

1. Go to the Google Cloud Console (https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google Classroom API and Google Drive API
4. Create credentials (OAuth 2.0 Client IDs) for a desktop application
5. In the OAuth client configuration, add these Authorized redirect URIs:
   - http://localhost:8080
   - http://127.0.0.1:8080
   - http://localhost
   - urn:ietf:wg:oauth:2.0:oob
6. Download the credentials.json file and replace this template

IMPORTANT: Make sure your OAuth consent screen is configured with:
- Application type: Desktop application
- Test users: Add your Google account email
- Required scopes (add these in the OAuth consent screen):
  * https://www.googleapis.com/auth/classroom.courses.readonly
  * https://www.googleapis.com/auth/classroom.coursework.students.readonly  
  * https://www.googleapis.com/auth/classroom.coursework.me.readonly
  * https://www.googleapis.com/auth/classroom.announcements.readonly
  * https://www.googleapis.com/auth/drive.readonly
  * https://www.googleapis.com/auth/drive.file

The downloaded file should have the same structure as this template but with your actual values.
    """
    
    if not os.path.exists('credentials.json'):
        with open('credentials.json', 'w') as f:
            json.dump(template, f, indent=2)
        
        with open('credentials_setup_instructions.txt', 'w') as f:
            f.write(instructions)
        
        logging.info("Created credentials template and setup instructions")
        return True
    
    return False
