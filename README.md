# Google Classroom Downloader

A comprehensive full-stack web application that automatically downloads and organizes Google Classroom materials on your local system. Built with Flask (Python) backend and vanilla JavaScript frontend.

## Features

### Core Functionality
- **Google Classroom Integration**: Fetches courses, coursework, materials, and announcements via Google Classroom API
- **Google Drive Integration**: Downloads attachments with automatic Google Docs→PDF conversion
- **Smart Organization**: Organizes files into `BASE_DIR/CourseName/Category/` structure
- **File Deduplication**: Prevents downloading duplicate files using hash comparison
- **Parallel Downloads**: Supports concurrent downloads with rate limiting
- **SQLite Database**: Maintains searchable index of all downloaded materials
- **Progress Tracking**: Real-time download progress with error reporting

### Web Interface
- **Authentication**: Secure OAuth2 authentication with Google
- **Course Selection**: Choose specific courses and date ranges for download
- **Progress Monitoring**: Real-time progress updates with file-level details
- **Material Browser**: Search and browse downloaded materials
- **File Reassignment**: Move uncategorized files to correct courses via drag-and-drop
- **Statistics Dashboard**: View download statistics by course and file type

### File Management
- **Safe Filename Handling**: Automatically sanitizes filenames for filesystem compatibility
- **Category Organization**: Sorts files into PDFs, Documents, Images, Videos, etc.
- **HTML Index Generation**: Creates browsable HTML indexes for each course
- **Uncategorized Handling**: Special handling for stream-only posts without course assignment

## Directory Structure

```
classroom-downloader/
├── app.py                      # Main Flask application
├── requirements.txt            # Python dependencies
├── README.md                   # This file
├── credentials.json            # Google API credentials (you provide)
├── token.json                  # OAuth tokens (auto-generated)
├── classroom_materials.db      # SQLite database (auto-created)
│
├── backend/                    # Backend Python modules
│   ├── __init__.py
│   ├── auth.py                # Google API authentication
│   ├── database.py            # SQLite database management
│   ├── file_manager.py        # File system operations
│   ├── classroom_api.py       # Google Classroom API client
│   ├── downloader.py          # File download logic
│   └── index_generator.py     # HTML index generation
│
├── templates/
│   └── index.html             # Main web interface
│
├── static/
│   ├── css/
│   │   └── style.css          # Frontend styles
│   └── js/
│       └── app.js             # Frontend JavaScript
│
└── downloads/                 # Default download directory
    ├── index.html            # Main materials index
    ├── Course_Name_1/        # Individual course directories
    │   ├── index.html        # Course-specific index
    │   ├── PDFs/
    │   ├── Documents/
    │   ├── Images/
    │   ├── Videos/
    │   └── Other/
    └── Uncategorized/        # Files without course assignment
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
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   
   # Install dependencies
   pip install -r requirements.txt
   ```

2. **Add Google Credentials**:
   - Rename your downloaded credentials file to `credentials.json`
   - Place it in the project root directory

3. **Configure Settings** (Optional):
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
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Run the application
python app.py
```

The application will be available at `http://localhost:5000`

## Usage Guide

### Initial Setup

1. **Open Web Interface**: Navigate to `http://localhost:5000`

2. **Configure Download Directory**:
   - Set your preferred download location
   - Choose max concurrent downloads (1-10)
   - Click "Update" to save settings

3. **Authenticate with Google**:
   - Click "Authenticate" button
   - Complete OAuth flow in your browser
   - Grant necessary permissions

### Downloading Materials

1. **Select Courses**:
   - Click "Refresh Courses" to load available courses
   - Check courses you want to download
   - Use "Select All" / "Deselect All" for convenience

2. **Set Date Range** (Optional):
   - Choose start and end dates
   - Leave blank to download all materials

3. **Start Download**:
   - Click "Start Download"
   - Monitor real-time progress
   - View any errors in the progress panel

### Managing Downloaded Materials

1. **Browse Materials**:
   - Use the search function to find specific files
   - Filter by course or file type
   - Click links to open files

2. **Handle Uncategorized Files**:
   - Review files in "Uncategorized Materials" section
   - Use dropdown to assign files to correct courses
   - Files will be moved automatically

3. **View Statistics**:
   - Check total files, size, and course counts
   - Monitor uncategorized file count

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
- `POST /api/authenticate` - Start OAuth flow
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

## Troubleshooting

### Common Issues

**"Credentials file not found"**
- Ensure `credentials.json` is in the project root
- Verify the file is valid JSON from Google Cloud Console

**"Authentication failed"**
- Check that required APIs are enabled in Google Cloud Console
- Verify OAuth consent screen is properly configured
- Ensure your account has access to the courses

**"Access denied" errors during download**
- Some files may be private or restricted
- Check file permissions in Google Drive
- These errors are logged but don't stop the download process

**Download stops or fails**
- Check internet connection
- Verify Google API quotas haven't been exceeded
- Review error logs in the progress panel

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

## Changelog

### Version 1.0.0
- Initial release
- Full Google Classroom and Drive integration
- Web interface for course selection and progress monitoring
- Automatic file organization and HTML index generation
- Material reassignment and search functionality
