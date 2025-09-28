# Google Classroom Downloader

A comprehensive full-stack web application that automatically downloads and organizes Google Classroom materials on your local system. Built with Flask (Python) backend and vanilla JavaScript frontend with real-time progress tracking and AI-powered organization.

## ✨ Key Features

### Core Functionality
- **Google Classroom Integration**: Fetches courses, coursework, materials, and announcements via Google Classroom API
- **Google Drive Integration**: Downloads attachments with automatic Google Docs→PDF conversion
- **Smart Organization**: Organizes files into `BASE_DIR/CourseName/Category/` structure
- **File Deduplication**: Prevents downloading duplicate files using hash comparison
- **Parallel Downloads**: Supports concurrent downloads with rate limiting
- **SQLite Database**: Maintains searchable index of all downloaded materials
- **Real-time Progress Tracking**: Live download progress with detailed logging and file-level updates

### 🎯 Enhanced Web Interface
- **Auto-refresh on Load**: Courses and subject organization refresh automatically when page loads
- **Auto-refresh on Login**: All data refreshes automatically after successful authentication
- **Real-time Download Progress**: Visible progress bars, file counts, current file processing, and activity logs
- **Live Download Logging**: See exactly what's happening during downloads with real-time status updates
- **Subject Organization**: Intelligent file categorization with drag-and-drop interface
- **AI Classification**: Powered by Google Gemini for intelligent document analysis and classification
- **Progress Persistence**: Download progress continues to display even after page refresh

### 🤖 AI-Powered Features
- **Intelligent Subject Classification**: Uses Google Gemini AI to automatically categorize files by subject
- **Document Analysis**: AI analyzes document content for better organization
- **Smart Keyword Matching**: Advanced subject detection based on content and metadata
- **Confidence Scoring**: AI provides confidence levels for classification decisions

### 📊 Advanced File Management
- **Subject Bins**: Visual drag-and-drop interface for organizing files by subject
- **Auto-classification**: Automatic file categorization using keyword matching and AI
- **Real-time Updates**: Subject organization updates automatically after downloads
- **Safe Filename Handling**: Automatically sanitizes filenames for filesystem compatibility
- **Category Organization**: Sorts files into PDFs, Documents, Images, Videos, etc.
- **HTML Index Generation**: Creates browsable HTML indexes for each course
- **Uncategorized Handling**: Special handling for stream-only posts without course assignment

## Directory Structure

```
classroom-downloader/
├── app.py                          # Main Flask application
├── requirements.txt                # Python dependencies
├── pyproject.toml                  # Python project configuration
├── uv.lock                        # UV dependency lock file
├── README.md                      # This file
├── credentials.json               # Google API credentials (you provide)
├── token.json                     # OAuth tokens (auto-generated)
├── classroom_materials.db         # SQLite database (auto-created)
├── classroom_downloader.log       # Application logs
│
├── backend/                       # Backend Python modules
│   ├── __init__.py
│   ├── auth.py                   # Google API authentication
│   ├── database.py               # SQLite database management
│   ├── file_manager.py           # File system operations
│   ├── classroom_api.py          # Google Classroom API client
│   ├── downloader.py             # File download logic
│   ├── index_generator.py        # HTML index generation
│   ├── subject_classifier.py     # Subject classification system
│   └── llm_analyzer.py          # AI-powered document analyzer (Gemini)
│
├── templates/
│   └── index.html                # Main web interface with real-time features
│
├── static/
│   ├── css/
│   │   └── style.css             # Enhanced UI styles with progress indicators
│   └── js/
│       └── app.js                # Enhanced frontend with real-time updates
│
└── downloads/                    # Default download directory
    ├── index.html               # Main materials index
    ├── Course_Name_1/           # Individual course directories
    │   ├── index.html           # Course-specific index
    │   ├── PDFs/
    │   ├── Documents/
    │   ├── Images/
    │   ├── Videos/
    │   ├── Presentations/
    │   ├── Spreadsheets/
    │   ├── Audio/
    │   ├── Archives/
    │   ├── Web/
    │   └── Other/
    └── Uncategorized/           # Files without course assignment
```

## Setup Instructions

### 1. Prerequisites

- Python 3.8 or higher
- Google Account with access to Google Classroom
- Google Cloud Project with enabled APIs

### 2. Google Cloud Console Setup

1. **Create a Google Cloud Project**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing one

2. **Enable Required APIs**:
   - Enable **Google Classroom API**
   - Enable **Google Drive API**

3. **Create OAuth 2.0 Credentials**:
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth 2.0 Client IDs"
   - Choose "Desktop Application"
   - Download the credentials JSON file

4. **Configure OAuth Consent Screen**:
   - Go to "APIs & Services" → "OAuth consent screen"
   - Add your email as a test user if using external user type
   - Add the following scopes:
     - `https://www.googleapis.com/auth/classroom.courses.readonly`
     - `https://www.googleapis.com/auth/classroom.coursework.students.readonly`
     - `https://www.googleapis.com/auth/classroom.coursework.me.readonly`
     - `https://www.googleapis.com/auth/classroom.announcements.readonly`
     - `https://www.googleapis.com/auth/drive.readonly`
     - `https://www.googleapis.com/auth/drive.file`

### 3. Application Setup

1. **Clone and Install**:
   ```bash
   git clone <repository-url>
   cd classroom-downloader
   
   # Create virtual environment
   python -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   
   # Install dependencies
   pip install -r requirements.txt
   ```

2. **Add Google Credentials**:
   - Rename your downloaded credentials file to `credentials.json`
   - Place it in the project root directory

3. **Configure AI Features** (Optional):
   ```bash
   # Add Google Gemini API key for AI classification
   export GEMINI_API_KEY="your_gemini_api_key_here"
   ```
   - Get your API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
   - Without this, AI classification features will be disabled but basic functionality works

4. **Configure Settings** (Optional):
   ```bash
   # Set custom download directory
   export CLASSROOM_BASE_DIR="/path/to/your/downloads"
   
   # Set Flask configuration
   export FLASK_HOST="0.0.0.0"      # Default: 127.0.0.1
   export FLASK_PORT="5000"         # Default: 5000
   export FLASK_DEBUG="False"       # Default: False
   ```

### 4. Running the Application

```bash
# Activate virtual environment
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Run the application
python app.py
```

The application will be available at `http://localhost:5000`

## 🚀 Usage Guide

### Initial Setup

1. **Open Web Interface**: Navigate to `http://localhost:5000`

2. **Configure Download Directory**:
   - Set your preferred download location
   - Choose max concurrent downloads (1-10)
   - Click "Update" to save settings

3. **Authenticate with Google**:
   - Click "Authenticate" button
   - Complete OAuth flow in popup window
   - Grant necessary permissions
   - **Courses and subjects will auto-refresh after successful login**

### Enhanced Download Experience

1. **Automatic Data Loading**:
   - Courses load automatically when page loads
   - Subject organization refreshes on every page visit
   - No need to manually refresh - everything updates automatically

2. **Real-time Download Progress**:
   - **Live Progress Bar**: Visual progress indicator with percentage
   - **File Counters**: See completed/total files in real-time
   - **Current File Display**: Shows exactly which file is being processed
   - **Download Activity Log**: Real-time log of all download activities
   - **Error Reporting**: Immediate error notifications with details

3. **Smart Course Selection**:
   - Auto-loaded course list on authentication
   - Select specific courses or use "Select All"
   - Optional date range filtering

### 🧠 AI-Powered Subject Organization

1. **Subject Management**:
   - **Visual Subject Bins**: Drag-and-drop interface for file organization
   - **Auto-classification**: Files automatically categorized using keyword matching
   - **AI Classification**: Use Google Gemini for intelligent content analysis
   - **Confidence Scoring**: AI provides confidence levels for classifications

2. **Using AI Features**:
   - Click "AI Classify" button (appears when Gemini API key is configured)
   - Set confidence threshold for automatic classification
   - Review and approve AI suggestions
   - Files are automatically moved to appropriate subject bins

3. **Manual Organization**:
   - Drag files between subject bins
   - Create new subjects with custom keywords and colors
   - Assign priority levels for classification precedence

### Real-time Download Monitoring

1. **Progress Tracking Features**:
   - **Progress Container**: Always visible during downloads
   - **Live Activity Log**: See real-time download events
   - **File Processing Status**: Current file being downloaded
   - **Success/Error Counts**: Immediate feedback on download results
   - **Completion Summary**: Detailed results when download finishes

2. **Download Log Messages Include**:
   - Download initiation
   - File processing updates
   - Success confirmations
   - Error notifications
   - Completion statistics
   - Data refresh confirmations

### Managing Downloaded Materials

1. **Enhanced Browse Experience**:
   - **Auto-refresh**: Data updates automatically after downloads
   - **Integrated Search**: Find files quickly with enhanced search
   - **Subject-based Organization**: Files organized by AI-detected subjects
   - **Real-time Updates**: File counts and statistics update automatically

2. **Subject Organization**:
   - **Visual Interface**: Drag-and-drop subject bins
   - **Automatic Updates**: Subject organization refreshes after each download
   - **Smart Classification**: Files automatically sorted using AI and keywords
   - **Manual Override**: Always maintain control with manual organization options

### Generated HTML Indexes

The application automatically generates HTML index pages:

- **Main Index** (`downloads/index.html`): Overview of all courses
- **Course Indexes** (`downloads/CourseName/index.html`): Course-specific file listings

These provide an alternative way to browse materials without the web interface.

## File Organization

### Directory Structure
Files are organized as follows:
```
downloads/
├── Course_Name/
│   ├── PDFs/           # PDF files and converted Google Docs
│   ├── Documents/      # Word docs, text files
│   ├── Presentations/  # PowerPoint, Google Slides
│   ├── Spreadsheets/   # Excel files, Google Sheets
│   ├── Images/         # JPG, PNG, GIF, etc.
│   ├── Videos/         # MP4, AVI, MOV, etc.
│   ├── Audio/          # MP3, WAV, etc.
│   ├── Archives/       # ZIP, RAR, etc.
│   ├── Web/           # HTML, CSS, JS files
│   └── Other/         # Unrecognized file types
└── Uncategorized/     # Files without course assignment
```

### File Naming
- Filenames are automatically sanitized for filesystem safety
- Unsafe characters are replaced with underscores
- Long filenames are truncated while preserving extensions
- Duplicate names get numeric suffixes

### Google File Conversion
- **Google Docs** → PDF format
- **Google Slides** → PDF format  
- **Google Sheets** → Excel (.xlsx) format
- **Google Drawings** → PDF format

## API Documentation

The Flask backend provides REST API endpoints:

### Authentication
- `GET /oauth2/start` - Returns Google OAuth URL (popup flow)
- `GET /oauth2/callback` - Handles Google redirect in popup and closes it
- `POST /api/authenticate` - Legacy/manual flow support (kept for fallback)
- `POST /api/logout` - Revoke credentials
- `GET /api/status` - Check auth and system status

### Course Management
- `GET /api/courses` - List available courses
- `GET /api/settings` - Get current settings
- `POST /api/settings` - Update settings

### Downloads
- `POST /api/download` - Start download process
- `GET /api/download/status` - Get download progress

### Materials
- `GET /api/materials` - Search/list materials
- `GET /api/materials/uncategorized` - Get uncategorized materials
- `POST /api/materials/<id>/move` - Move material to course

### Statistics
- `GET /api/statistics` - Get database and filesystem stats

### AI/Subject Organization
- `GET /api/llm/status` - Check AI analyzer status and capabilities
- `GET /api/subjects` - Get all subjects
- `POST /api/subjects` - Create new subject
- `PUT /api/subjects/<id>` - Update subject
- `DELETE /api/subjects/<id>` - Delete subject
- `GET /api/files/by-subject` - Get files organized by subject
- `POST /api/classify/auto` - Auto-classify files using keywords
- `POST /api/classify/llm` - AI-classify files using Gemini
- `POST /api/files/<id>/assign-subject` - Assign file to subject

## 🔧 Troubleshooting

### Common Issues

**"Credentials file not found"**
- Ensure `credentials.json` is in the project root
- Verify the file is valid JSON from Google Cloud Console

**"AI classification is not available"**
- Add your `GEMINI_API_KEY` environment variable
- Get API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
- Restart the application after adding the key
- Check logs for Gemini connection status

**"Authentication failed"**
- Check that required APIs are enabled in Google Cloud Console
- Verify OAuth consent screen is properly configured
- Ensure your account has access to the courses

**"No courses showing" or "Subject organization not loading"**
- Courses and subjects now auto-refresh on page load and login
- Check browser console for any JavaScript errors
- Verify authentication status in the top-right corner
- Refresh the page to trigger auto-loading

**"Download progress not visible"**
- Progress container now appears automatically when downloads start
- Check browser console for any errors
- Ensure JavaScript is enabled
- Progress persists even after page refresh

**"Access denied" errors during download**
- Some files may be private or restricted
- Check file permissions in Google Drive
- These errors are logged but don't stop the download process

**Download stops or fails**
- Check internet connection
- Verify Google API quotas haven't been exceeded
- Review error logs in the progress panel and real-time activity log

### Performance Optimization

**Large Downloads**:
- Reduce concurrent downloads if experiencing timeouts
- Use date range filtering to download in batches
- Monitor system resources during large downloads

**Rate Limiting**:
- Google APIs have usage quotas and rate limits
- The application includes automatic rate limiting
- Adjust request delays if getting quota errors

### Logs and Debugging

Application logs are written to `classroom_downloader.log`:
```bash
tail -f classroom_downloader.log
```

Enable debug mode for detailed logging:
```bash
export FLASK_DEBUG=True
python app.py
```

## Database Schema

The SQLite database contains the following tables:

### materials
- `id` - Unique identifier
- `title` - File title
- `date_created` - Original creation date
- `date_updated` - Last update date
- `mime_type` - File MIME type
- `course_id` - Associated course ID
- `course_name` - Course name
- `local_path` - Path to downloaded file
- `remote_id` - Google Drive file ID
- `file_size` - File size in bytes
- `file_hash` - SHA256 hash for deduplication
- `material_type` - Type (ASSIGNMENT, ANNOUNCEMENT, etc.)
- `download_date` - When file was downloaded
- `original_url` - Original Google URL
- `description` - Material description

### courses
- `id` - Course ID
- `name` - Course name
- `description` - Course description
- `enrollment_code` - Course enrollment code
- `owner_id` - Course owner
- `creation_time` - Course creation time
- `update_time` - Last update time
- `last_sync` - Last sync with application

## Security Considerations

- OAuth tokens are stored locally in `token.json`
- Credentials file should be kept secure and not committed to version control
- The application runs locally and doesn't send data to external servers
- File downloads respect Google Drive sharing permissions

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License. See LICENSE file for details.

## Support

For issues and questions:

1. Check the troubleshooting section above
2. Review the application logs
3. Search existing GitHub issues
4. Create a new issue with detailed information

## 📈 Changelog

### Version 2.0.0 - Enhanced Real-time Experience
#### 🚀 Major Features
- **Auto-refresh Functionality**: Courses and subjects refresh automatically on page load and login
- **Real-time Download Progress**: Live progress tracking with detailed activity logs
- **AI-Powered Classification**: Google Gemini integration for intelligent file categorization
- **Enhanced Subject Organization**: Visual drag-and-drop interface with auto-classification
- **Progress Persistence**: Download progress continues to display after page refresh

#### ✨ User Experience Improvements
- **Live Activity Logging**: Real-time download status in user-friendly format
- **Smart Progress Display**: Automatic progress container management
- **Enhanced Error Reporting**: Detailed error messages with context
- **Immediate Feedback**: All actions provide instant visual feedback
- **Auto-loading Data**: No manual refresh needed for courses or subjects

#### 🤖 AI Features
- **Gemini Integration**: Advanced document analysis and classification
- **Confidence Scoring**: AI provides confidence levels for decisions
- **Content Analysis**: Intelligent subject detection based on file content
- **Smart Keywords**: Enhanced keyword-based classification system

#### 🛠️ Technical Enhancements
- **Enhanced API Endpoints**: New endpoints for AI features and subject management
- **Improved Logging**: Comprehensive activity tracking and debugging
- **Better Error Handling**: Robust error management throughout the application
- **Performance Optimizations**: Faster loading and better resource management

### Version 1.0.0 - Initial Release
- Full Google Classroom and Drive integration
- Web interface for course selection and progress monitoring
- Automatic file organization and HTML index generation
- Material reassignment and search functionality
- SQLite database for material indexing
- Basic authentication and download management
