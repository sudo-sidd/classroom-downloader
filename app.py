import os
import asyncio
import logging
import json
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from pathlib import Path
import threading

from flask import Flask, request, jsonify, render_template, send_from_directory, redirect, url_for, make_response
from flask_cors import CORS
from werkzeug.exceptions import BadRequest

from backend.auth import GoogleAPIAuth, setup_credentials_template
from backend.database import DatabaseManager
from backend.file_manager import FileSystemManager
from backend.classroom_api import ClassroomAPIClient
from backend.downloader import FileDownloader
from backend.index_generator import IndexGenerator
from backend.subject_classifier import SubjectClassifier
from backend.llm_analyzer import LLMDocumentAnalyzer


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('classroom_downloader.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__, 
           template_folder='./templates',
           static_folder='./static')
CORS(app)

# Global variables for managers
auth_manager: Optional[GoogleAPIAuth] = None
db_manager: Optional[DatabaseManager] = None
file_manager: Optional[FileSystemManager] = None
classroom_client: Optional[ClassroomAPIClient] = None
downloader: Optional[FileDownloader] = None
index_generator: Optional[IndexGenerator] = None
subject_classifier: Optional[SubjectClassifier] = None
llm_analyzer: Optional[LLMDocumentAnalyzer] = None

# Global state for downloads
current_download_status: Dict[str, Any] = {}
download_lock = threading.Lock()


def initialize_managers():
    """Initialize all manager instances."""
    global auth_manager, db_manager, file_manager, classroom_client, downloader, index_generator, subject_classifier, llm_analyzer
    
    try:
        # Setup credentials template if needed
        setup_credentials_template()
        
        # Initialize managers
        auth_manager = GoogleAPIAuth()
        db_manager = DatabaseManager()
        
        # Default base directory - will be updated via API
        base_dir = os.environ.get('CLASSROOM_BASE_DIR', './downloads')
        file_manager = FileSystemManager(base_dir)
        
        classroom_client = ClassroomAPIClient(auth_manager)
        downloader = FileDownloader(auth_manager, file_manager, db_manager)
        index_generator = IndexGenerator(file_manager, db_manager)
        subject_classifier = SubjectClassifier(db_manager)
        llm_analyzer = LLMDocumentAnalyzer(db_manager)
        
        logger.info("All managers initialized successfully")
        if llm_analyzer.is_available():
            logger.info("LLM Document Analyzer is ready for intelligent classification")
        else:
            logger.warning("LLM Document Analyzer is not available - check GEMINI_API_KEY")
        return True
        
    except Exception as e:
        logger.error(f"Failed to initialize managers: {e}")
        return False


@app.route('/')
def index():
    """Serve the main application page."""
    return render_template('index.html')

# --- Popup-based OAuth endpoints ---
@app.route('/oauth2/start')
def oauth2_start():
        """Return the Google OAuth authorization URL for popup flow."""
        try:
                if not auth_manager:
                        return jsonify({'error': 'Auth manager not initialized'}), 500
                # Use this server as redirect target
                redirect_uri = request.url_root.rstrip('/') + url_for('oauth2_callback')
                auth_url = auth_manager.start_web_auth(redirect_uri)
                return jsonify({'auth_url': auth_url})
        except Exception as e:
                logger.error(f"OAuth start error: {e}")
                return jsonify({'error': str(e)}), 500

@app.route('/oauth2/callback')
def oauth2_callback():
        """Handle Google redirect in popup; closes window and notifies opener."""
        try:
                if not auth_manager:
                        return make_response('Auth manager not initialized', 500)
                state = request.args.get('state')
                # Reconstruct full URL to pass to flow
                authorization_response = request.url
                success = auth_manager.finish_web_auth(state, authorization_response)
                status = 'success' if success else 'error'
                message = 'Authentication successful' if success else 'Authentication failed'
                # Small HTML that notifies opener and closes popup
                html = f"""
<!doctype html>
<html>
    <body>
        <script>
            try {{
                if (window.opener && !window.opener.closed) {{
                    window.opener.postMessage({{ type: 'oauth-result', status: '{status}', message: '{message}' }}, '*');
                }}
            }} catch (e) {{}}
            window.close();
        </script>
        <noscript>{message}. You can close this window.</noscript>
    </body>
 </html>
                """
                resp = make_response(html)
                resp.headers['Content-Type'] = 'text/html; charset=utf-8'
                return resp
        except Exception as e:
                logger.error(f"OAuth callback error: {e}")
                return make_response('Authentication error', 500)


@app.route('/api/status')
def api_status():
    """Get application status."""
    try:
        status = {
            'managers_initialized': all([
                auth_manager, db_manager, file_manager, 
                classroom_client, downloader, index_generator
            ]),
            'authenticated': auth_manager.is_authenticated() if auth_manager else False,
            'base_directory': str(file_manager.base_dir) if file_manager else None,
            'database_status': 'connected' if db_manager else 'not_connected',
            'credentials_file_exists': os.path.exists('credentials.json')
        }
        
        if status['authenticated']:
            # Test API connections
            connection_test = auth_manager.test_connection()
            status['api_connections'] = connection_test
        
        return jsonify(status)
        
    except Exception as e:
        logger.error(f"Error getting status: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/authenticate', methods=['POST'])
def api_authenticate():
    """Authenticate with Google APIs."""
    try:
        if not auth_manager:
            return jsonify({'error': 'Auth manager not initialized'}), 500
        
        # Handle both JSON and form data
        if request.is_json:
            data = request.get_json() or {}
        else:
            data = request.form.to_dict()
        
        auth_code = data.get('auth_code')
        
        if auth_code:
            # Complete authentication with provided code
            success = auth_manager.authenticate_with_code(auth_code)
            
            if success:
                connection_test = auth_manager.test_connection()
                return jsonify({
                    'success': True,
                    'message': 'Authentication successful',
                    'connections': connection_test
                })
            else:
                return jsonify({
                    'success': False,
                    'message': 'Invalid authorization code'
                }), 401
        else:
            # Try automatic authentication first
            success = auth_manager.authenticate()
            
            if success:
                # Test connections
                connection_test = auth_manager.test_connection()
                return jsonify({
                    'success': True,
                    'message': 'Authentication successful',
                    'connections': connection_test
                })
            else:
                # If automatic auth fails, provide manual auth URL
                try:
                    auth_url = auth_manager.get_auth_url()
                    return jsonify({
                        'success': False,
                        'message': 'Manual authentication required',
                        'auth_url': auth_url,
                        'instructions': 'Please visit the auth_url, authorize the application, and provide the authorization code.'
                    }), 202  # Accepted, but requires additional action
                except Exception as e:
                    return jsonify({
                        'success': False,
                        'message': f'Authentication setup failed: {str(e)}'
                    }), 500
            
    except Exception as e:
        logger.error(f"Authentication error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/auth-url')
def api_get_auth_url():
    """Get Google OAuth authorization URL for manual authentication."""
    try:
        if not auth_manager:
            return jsonify({'error': 'Auth manager not initialized'}), 500
        
        auth_url = auth_manager.get_auth_url()
        return jsonify({
            'auth_url': auth_url,
            'instructions': 'Visit this URL, authorize the application, and copy the authorization code back to the app.'
        })
        
    except Exception as e:
        logger.error(f"Error getting auth URL: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/logout', methods=['POST'])
def api_logout():
    """Revoke authentication."""
    try:
        if not auth_manager:
            return jsonify({'error': 'Auth manager not initialized'}), 500
        
        success = auth_manager.revoke_credentials()
        
        return jsonify({
            'success': success,
            'message': 'Logged out successfully' if success else 'Logout failed'
        })
        
    except Exception as e:
        logger.error(f"Logout error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/courses')
def api_get_courses():
    """Get all available courses."""
    try:
        if not classroom_client:
            return jsonify({'error': 'Classroom client not initialized'}), 500
        
        if not auth_manager.is_authenticated():
            return jsonify({'error': 'Not authenticated'}), 401
        
        courses = classroom_client.get_courses()
        
        # Save courses to database
        for course in courses:
            db_manager.add_course(course)
        
        return jsonify({
            'courses': courses,
            'total': len(courses)
        })
        
    except Exception as e:
        logger.error(f"Error getting courses: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/settings', methods=['GET', 'POST'])
def api_settings():
    """Get or update application settings."""
    global file_manager
    
    if request.method == 'GET':
        settings = {
            'base_directory': str(file_manager.base_dir) if file_manager else None,
            'max_concurrent_downloads': downloader.max_concurrent if downloader else 5,
            'request_delay': downloader.request_delay if downloader else 0.1
        }
        return jsonify(settings)
    
    elif request.method == 'POST':
        try:
            data = request.get_json()
            
            # Update base directory
            if 'base_directory' in data:
                new_base_dir = data['base_directory']
                if not new_base_dir:
                    return jsonify({'error': 'Base directory cannot be empty'}), 400
                
                # Update file manager
                file_manager = FileSystemManager(new_base_dir)
                
                # Update downloader with new file manager
                if downloader:
                    downloader.file_manager = file_manager
            
            # Update download settings
            if downloader:
                if 'max_concurrent_downloads' in data:
                    downloader.max_concurrent = max(1, min(10, data['max_concurrent_downloads']))
                
                if 'request_delay' in data:
                    downloader.request_delay = max(0.01, min(1.0, data['request_delay']))
            
            return jsonify({'success': True, 'message': 'Settings updated'})
            
        except Exception as e:
            logger.error(f"Error updating settings: {e}")
            return jsonify({'error': str(e)}), 500


@app.route('/api/download', methods=['POST'])
def api_start_download():
    """Start downloading materials."""
    global current_download_status
    
    try:
        if not all([auth_manager, classroom_client, downloader]):
            return jsonify({'error': 'Components not initialized'}), 500
        
        if not auth_manager.is_authenticated():
            return jsonify({'error': 'Not authenticated'}), 401
        
        # Check if download is already in progress
        with download_lock:
            if current_download_status.get('is_active', False):
                return jsonify({'error': 'Download already in progress'}), 409
        
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        # Parse request
        course_ids = data.get('course_ids', [])
        start_date_str = data.get('start_date')
        end_date_str = data.get('end_date')
        
        if not course_ids:
            return jsonify({'error': 'No courses selected'}), 400
        
        # Parse dates
        start_date = None
        end_date = None
        
        if start_date_str:
            try:
                start_date = datetime.fromisoformat(start_date_str.replace('Z', '+00:00'))
            except ValueError:
                return jsonify({'error': 'Invalid start date format'}), 400
        
        if end_date_str:
            try:
                end_date = datetime.fromisoformat(end_date_str.replace('Z', '+00:00'))
            except ValueError:
                return jsonify({'error': 'Invalid end date format'}), 400
        
        # Start download in background thread
        def run_download():
            try:
                # Set up progress callback
                def progress_callback(status):
                    with download_lock:
                        current_download_status.update(status)
                        current_download_status['is_active'] = not status.get('is_complete', False)
                
                downloader.set_progress_callback(progress_callback)
                
                # Mark as active
                with download_lock:
                    current_download_status = {
                        'is_active': True,
                        'session_id': datetime.now().strftime("%Y%m%d_%H%M%S"),
                        'start_time': datetime.now().isoformat(),
                        'message': 'Fetching materials from Google Classroom...'
                    }
                
                # Fetch all materials
                logger.info(f"Fetching materials for courses: {course_ids}")
                materials_data = classroom_client.get_all_materials(course_ids, start_date, end_date)
                
                # Extract attachments
                attachments = classroom_client.extract_attachments(materials_data)
                logger.info(f"Found {len(attachments)} attachments to download")
                
                if not attachments:
                    with download_lock:
                        current_download_status.update({
                            'is_active': False,
                            'is_complete': True,
                            'message': 'No attachments found to download',
                            'total_files': 0,
                            'completed_files': 0
                        })
                    return
                
                # Start download
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                
                final_status = loop.run_until_complete(
                    downloader.download_attachments(attachments)
                )
                
                with download_lock:
                    current_download_status.update(final_status)
                    current_download_status['is_active'] = False
                    current_download_status['end_time'] = datetime.now().isoformat()
                
                # Generate HTML indexes after successful download
                if final_status.get('final_successful', 0) > 0:
                    try:
                        logger.info("Generating HTML indexes...")
                        index_results = index_generator.generate_all_course_indexes()
                        logger.info(f"Generated indexes for {len(index_results)} courses")
                    except Exception as e:
                        logger.error(f"Error generating HTML indexes: {e}")
                
                logger.info("Download completed successfully")
                
            except Exception as e:
                logger.error(f"Download error: {e}")
                with download_lock:
                    current_download_status.update({
                        'is_active': False,
                        'error': str(e),
                        'end_time': datetime.now().isoformat()
                    })
        
        # Start download thread
        download_thread = threading.Thread(target=run_download, daemon=True)
        download_thread.start()
        
        return jsonify({
            'success': True,
            'message': 'Download started',
            'session_id': current_download_status.get('session_id')
        })
        
    except Exception as e:
        logger.error(f"Error starting download: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/download/status')
def api_download_status():
    """Get current download status."""
    try:
        with download_lock:
            status = current_download_status.copy()
        
        return jsonify(status)
        
    except Exception as e:
        logger.error(f"Error getting download status: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/materials')
def api_get_materials():
    """Get materials from database."""
    try:
        course_id = request.args.get('course_id')
        search_query = request.args.get('search')
        mime_type = request.args.get('mime_type')
        
        if course_id:
            materials = db_manager.get_materials_by_course(course_id)
        elif search_query:
            materials = db_manager.search_materials(search_query, course_id, mime_type)
        else:
            # Get all materials (limit for performance)
            materials = db_manager.search_materials("", course_id, mime_type)
        
        return jsonify({
            'materials': materials,
            'total': len(materials)
        })
        
    except Exception as e:
        logger.error(f"Error getting materials: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/materials/uncategorized')
def api_get_uncategorized():
    """Get uncategorized materials."""
    try:
        materials = db_manager.get_uncategorized_materials()
        return jsonify({
            'materials': materials,
            'total': len(materials)
        })
        
    except Exception as e:
        logger.error(f"Error getting uncategorized materials: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/materials/<int:material_id>/move', methods=['POST'])
def api_move_material(material_id):
    """Move a material to a different course."""
    try:
        data = request.get_json()
        if not data or 'course_id' not in data:
            return jsonify({'error': 'Course ID required'}), 400
        
        new_course_id = data['course_id']
        new_course_name = data.get('course_name', f'Course_{new_course_id}')
        
        # Update database
        success = db_manager.update_material_course(material_id, new_course_id, new_course_name)
        
        if success:
            # TODO: Move actual file in filesystem
            return jsonify({'success': True, 'message': 'Material moved successfully'})
        else:
            return jsonify({'error': 'Failed to move material'}), 500
            
    except Exception as e:
        logger.error(f"Error moving material: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/statistics')
def api_get_statistics():
    """Get database and filesystem statistics."""
    try:
        db_stats = db_manager.get_statistics()
        fs_stats = file_manager.get_directory_stats()
        
        return jsonify({
            'database': db_stats,
            'filesystem': fs_stats
        })
        
    except Exception as e:
        logger.error(f"Error getting statistics: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/generate-indexes', methods=['POST'])
def api_generate_indexes():
    """Generate HTML index pages for all courses."""
    try:
        if not index_generator:
            return jsonify({'error': 'Index generator not initialized'}), 500
        
        logger.info("Manually generating HTML indexes...")
        results = index_generator.generate_all_course_indexes()
        
        successful = sum(1 for success in results.values() if success)
        total = len(results)
        
        return jsonify({
            'success': True,
            'message': f'Generated {successful}/{total} course indexes',
            'results': results
        })
        
    except Exception as e:
        logger.error(f"Error generating indexes: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/files/<path:filepath>')
def api_serve_file(filepath):
    """Serve downloaded files."""
    try:
        # Security check - ensure file is within base directory
        requested_path = Path(filepath)
        full_path = file_manager.base_dir / requested_path
        full_path = full_path.resolve()
        
        if not str(full_path).startswith(str(file_manager.base_dir.resolve())):
            return jsonify({'error': 'Access denied'}), 403
        
        if not full_path.exists():
            return jsonify({'error': 'File not found'}), 404
        
        return send_from_directory(
            str(full_path.parent),
            full_path.name,
            as_attachment=False
        )
        
    except Exception as e:
        logger.error(f"Error serving file: {e}")
        return jsonify({'error': str(e)}), 500


# Subject Management API Endpoints

@app.route('/api/subjects', methods=['GET'])
def api_get_subjects():
    """Get all subjects."""
    try:
        if not db_manager:
            return jsonify({'error': 'Database manager not initialized'}), 500
            
        subjects = db_manager.get_all_subjects()
        return jsonify({'subjects': subjects})
        
    except Exception as e:
        logger.error(f"Error getting subjects: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/subjects', methods=['POST'])
def api_create_subject():
    """Create a new subject."""
    try:
        if not db_manager:
            return jsonify({'error': 'Database manager not initialized'}), 500
            
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
            
        name = data.get('name', '').strip()
        keywords = data.get('keywords', '').strip()
        priority = int(data.get('priority', 5))
        color = data.get('color', '#3498db').strip()
        
        if not name:
            return jsonify({'error': 'Subject name is required'}), 400
        if not keywords:
            return jsonify({'error': 'Keywords are required'}), 400
            
        success = db_manager.add_subject(name, keywords, priority, color)
        if success:
            return jsonify({'message': 'Subject created successfully'}), 201
        else:
            return jsonify({'error': 'Subject already exists or creation failed'}), 400
            
    except Exception as e:
        logger.error(f"Error creating subject: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/subjects/<int:subject_id>', methods=['PUT'])
def api_update_subject(subject_id):
    """Update an existing subject."""
    try:
        if not db_manager:
            return jsonify({'error': 'Database manager not initialized'}), 500
            
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
            
        # Extract update fields
        update_fields = {}
        if 'name' in data and data['name'].strip():
            update_fields['name'] = data['name'].strip()
        if 'keywords' in data and data['keywords'].strip():
            update_fields['keywords'] = data['keywords'].strip()
        if 'priority' in data:
            update_fields['priority'] = int(data['priority'])
        if 'color' in data and data['color'].strip():
            update_fields['color'] = data['color'].strip()
            
        if not update_fields:
            return jsonify({'error': 'No valid update fields provided'}), 400
            
        success = db_manager.update_subject(subject_id, **update_fields)
        if success:
            return jsonify({'message': 'Subject updated successfully'})
        else:
            return jsonify({'error': 'Subject not found or update failed'}), 404
            
    except Exception as e:
        logger.error(f"Error updating subject: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/subjects/<int:subject_id>', methods=['DELETE'])
def api_delete_subject(subject_id):
    """Delete a subject."""
    try:
        if not db_manager:
            return jsonify({'error': 'Database manager not initialized'}), 500
            
        success = db_manager.delete_subject(subject_id)
        if success:
            return jsonify({'message': 'Subject deleted successfully'})
        else:
            return jsonify({'error': 'Subject not found'}), 404
            
    except Exception as e:
        logger.error(f"Error deleting subject: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/files/by-subject')
def api_get_files_by_subject():
    """Get files organized by subject."""
    try:
        if not db_manager:
            return jsonify({'error': 'Database manager not initialized'}), 500
            
        subject_id = request.args.get('subject_id', type=int)
        files_by_subject = db_manager.get_files_by_subject(subject_id)
        subjects = db_manager.get_all_subjects()
        
        return jsonify({
            'files_by_subject': files_by_subject,
            'subjects': subjects
        })
        
    except Exception as e:
        logger.error(f"Error getting files by subject: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/files/<int:material_id>/classify', methods=['POST'])
def api_classify_file(material_id):
    """Classify a file to a subject."""
    try:
        if not db_manager:
            return jsonify({'error': 'Database manager not initialized'}), 500
            
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
            
        subject_id = data.get('subject_id')
        if subject_id is None:
            return jsonify({'error': 'Subject ID is required'}), 400
            
        success = db_manager.classify_file(material_id, subject_id, 'manual')
        if success:
            return jsonify({'message': 'File classified successfully'})
        else:
            return jsonify({'error': 'Classification failed'}), 500
            
    except Exception as e:
        logger.error(f"Error classifying file: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/files/<int:material_id>/unclassify', methods=['POST'])
def api_unclassify_file(material_id):
    """Remove classification from a file."""
    try:
        if not db_manager:
            return jsonify({'error': 'Database manager not initialized'}), 500
            
        success = db_manager.unclassify_file(material_id)
        if success:
            return jsonify({'message': 'File unclassified successfully'})
        else:
            return jsonify({'error': 'File not found or not classified'}), 404
            
    except Exception as e:
        logger.error(f"Error unclassifying file: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/files/bulk-classify', methods=['POST'])
def api_bulk_classify_files():
    """Classify multiple files to a subject."""
    try:
        if not db_manager:
            return jsonify({'error': 'Database manager not initialized'}), 500
            
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
            
        material_ids = data.get('material_ids', [])
        subject_id = data.get('subject_id')
        
        if not material_ids:
            return jsonify({'error': 'No files provided'}), 400
        if subject_id is None:
            return jsonify({'error': 'Subject ID is required'}), 400
            
        success_count = 0
        for material_id in material_ids:
            if db_manager.classify_file(material_id, subject_id, 'manual'):
                success_count += 1
                
        return jsonify({
            'message': f'Classified {success_count} of {len(material_ids)} files',
            'success_count': success_count,
            'total_count': len(material_ids)
        })
        
    except Exception as e:
        logger.error(f"Error bulk classifying files: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/classify/auto', methods=['POST'])
def api_auto_classify():
    """Auto-classify all unclassified files."""
    try:
        if not all([db_manager, subject_classifier]):
            return jsonify({'error': 'Managers not initialized'}), 500
            
        data = request.get_json() or {}
        confidence_threshold = float(data.get('confidence_threshold', 0.7))
        
        # Get unclassified files
        files_by_subject = db_manager.get_files_by_subject()
        unclassified_files = files_by_subject.get('unclassified', [])
        
        if not unclassified_files:
            return jsonify({'message': 'No unclassified files found', 'results': []})
            
        # Classify files
        results = subject_classifier.classify_multiple_files(
            unclassified_files, 
            auto_apply=True
        )
        
        # Filter results for high confidence classifications
        auto_applied = [r for r in results if r['applied']]
        low_confidence = [r for r in results if r['classification'] and not r['applied']]
        
        return jsonify({
            'message': f'Auto-classified {len(auto_applied)} files',
            'auto_applied': len(auto_applied),
            'low_confidence': len(low_confidence),
            'total_processed': len(results),
            'results': results
        })
        
    except Exception as e:
        logger.error(f"Error auto-classifying files: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/files/<int:material_id>/suggestions')
def api_get_classification_suggestions(material_id):
    """Get classification suggestions for a specific file."""
    try:
        if not all([db_manager, subject_classifier]):
            return jsonify({'error': 'Managers not initialized'}), 500
            
        # Get material
        materials = db_manager.get_all_materials()
        material = next((m for m in materials if m['id'] == material_id), None)
        
        if not material:
            return jsonify({'error': 'Material not found'}), 404
            
        suggestions = subject_classifier.get_classification_suggestions(material, limit=3)
        return jsonify({'suggestions': suggestions})
        
    except Exception as e:
        logger.error(f"Error getting suggestions: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/classification/stats')
def api_get_classification_stats():
    """Get classification statistics."""
    try:
        if not db_manager:
            return jsonify({'error': 'Database manager not initialized'}), 500
            
        stats = db_manager.get_classification_stats()
        return jsonify(stats)
        
    except Exception as e:
        logger.error(f"Error getting classification stats: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/classify/llm', methods=['POST'])
def api_llm_classify():
    """Perform LLM-based intelligent classification of files."""
    try:
        if not all([db_manager, llm_analyzer]):
            return jsonify({'error': 'Required managers not initialized'}), 500
            
        if not llm_analyzer.is_available():
            return jsonify({'error': 'LLM analyzer not available. Check GEMINI_API_KEY in environment.'}), 500
            
        data = request.get_json() or {}
        material_ids = data.get('material_ids', [])
        auto_create_subjects = data.get('auto_create_subjects', True)
        confidence_threshold = float(data.get('confidence_threshold', 0.7))
        
        # Get materials to analyze
        if material_ids:
            all_materials = db_manager.get_all_materials()
            materials_to_analyze = [m for m in all_materials if m['id'] in material_ids]
        else:
            # Analyze all unclassified files
            files_by_subject = db_manager.get_files_by_subject()
            materials_to_analyze = files_by_subject.get('unclassified', [])
        
        if not materials_to_analyze:
            return jsonify({'message': 'No files to analyze', 'results': {}})
        
        # Perform async analysis
        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            results = loop.run_until_complete(
                llm_analyzer.analyze_and_classify_files(
                    materials_to_analyze,
                    auto_create_subjects,
                    confidence_threshold
                )
            )
        finally:
            loop.close()
        
        return jsonify({
            'message': f'Analyzed {results["total_analyzed"]} files, classified {results["successfully_classified"]}',
            'results': results
        })
        
    except Exception as e:
        logger.error(f"Error performing LLM classification: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/files/<int:material_id>/llm-suggestions')
def api_get_llm_suggestions(material_id):
    """Get LLM-powered subject suggestions for a specific file."""
    try:
        if not all([db_manager, llm_analyzer]):
            return jsonify({'error': 'Required managers not initialized'}), 500
            
        if not llm_analyzer.is_available():
            return jsonify({'error': 'LLM analyzer not available'}), 500
        
        # Perform async analysis
        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            suggestions = loop.run_until_complete(
                llm_analyzer.get_subject_suggestions_for_file(material_id)
            )
        finally:
            loop.close()
        
        return jsonify(suggestions)
        
    except Exception as e:
        logger.error(f"Error getting LLM suggestions: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/llm/status')
def api_llm_status():
    """Get LLM analyzer status and capabilities."""
    try:
        status = {
            'available': llm_analyzer.is_available() if llm_analyzer else False,
            'has_api_key': bool(os.getenv('GEMINI_API_KEY')),
            'supported_formats': ['pdf', 'docx', 'txt', 'md'] if llm_analyzer and llm_analyzer.is_available() else []
        }
        
        return jsonify(status)
        
    except Exception as e:
        logger.error(f"Error getting LLM status: {e}")
        return jsonify({'error': str(e)}), 500


@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors."""
    return jsonify({'error': 'Not found'}), 404


@app.errorhandler(500)
def internal_error(error):
    """Handle 500 errors."""
    logger.error(f"Internal server error: {error}")
    return jsonify({'error': 'Internal server error'}), 500


if __name__ == '__main__':
    # Initialize managers
    if not initialize_managers():
        logger.error("Failed to initialize application")
        exit(1)
    
    # Get configuration from environment
    host = os.environ.get('FLASK_HOST', '127.0.0.1')
    port = int(os.environ.get('FLASK_PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', 'False').lower() == 'true'
    
    logger.info(f"Starting Classroom Downloader on {host}:{port}")
    app.run(host=host, port=port, debug=debug)
