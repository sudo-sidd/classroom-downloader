import os
import re
import shutil
import hashlib
import logging
from typing import Optional, Dict, Any, List
from pathlib import Path
import unicodedata


class FileSystemManager:
    """Manages file system operations for classroom materials."""
    
    # MIME type to file extension mapping
    MIME_EXTENSIONS = {
        'application/pdf': '.pdf',
        'application/vnd.google-apps.document': '.pdf',  # Google Docs -> PDF
        'application/vnd.google-apps.presentation': '.pdf',  # Google Slides -> PDF
        'application/vnd.google-apps.spreadsheet': '.xlsx',  # Google Sheets -> XLSX
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
        'application/msword': '.doc',
        'application/vnd.ms-powerpoint': '.ppt',
        'application/vnd.ms-excel': '.xls',
        'text/plain': '.txt',
        'text/html': '.html',
        'text/css': '.css',
        'text/javascript': '.js',
        'application/json': '.json',
        'application/xml': '.xml',
        'text/xml': '.xml',
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/gif': '.gif',
        'image/bmp': '.bmp',
        'image/svg+xml': '.svg',
        'video/mp4': '.mp4',
        'video/mpeg': '.mpeg',
        'video/quicktime': '.mov',
        'video/x-msvideo': '.avi',
        'audio/mpeg': '.mp3',
        'audio/wav': '.wav',
        'audio/ogg': '.ogg',
        'application/zip': '.zip',
        'application/x-rar-compressed': '.rar',
        'application/x-7z-compressed': '.7z'
    }
    
    # File type categories for organization
    FILE_CATEGORIES = {
        'PDFs': ['.pdf'],
        'Documents': ['.doc', '.docx', '.odt', '.rtf', '.txt'],
        'Presentations': ['.ppt', '.pptx', '.odp'],
        'Spreadsheets': ['.xls', '.xlsx', '.ods', '.csv'],
        'Images': ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.tiff'],
        'Videos': ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv', '.mpeg'],
        'Audio': ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'],
        'Archives': ['.zip', '.rar', '.7z', '.tar', '.gz'],
        'Web': ['.html', '.htm', '.css', '.js', '.json', '.xml'],
        'Other': []  # Catch-all category
    }
    
    def __init__(self, base_dir: str):
        """Initialize with base directory for downloads."""
        self.base_dir = Path(base_dir).resolve()
        self.ensure_base_directory()
    
    def ensure_base_directory(self):
        """Ensure base directory exists."""
        try:
            self.base_dir.mkdir(parents=True, exist_ok=True)
            logging.info(f"Base directory ensured: {self.base_dir}")
        except Exception as e:
            logging.error(f"Failed to create base directory {self.base_dir}: {e}")
            raise
    
    def sanitize_filename(self, filename: str, max_length: int = 200) -> str:
        """Sanitize filename for filesystem safety."""
        # Remove or replace unsafe characters
        # First normalize unicode characters
        filename = unicodedata.normalize('NFKD', filename)
        
        # Remove or replace problematic characters
        unsafe_chars = r'[<>:"/\\|?*]'
        filename = re.sub(unsafe_chars, '_', filename)
        
        # Remove control characters
        filename = ''.join(char for char in filename if ord(char) >= 32)
        
        # Remove leading/trailing dots and spaces
        filename = filename.strip('. ')
        
        # Replace multiple spaces/underscores with single ones
        filename = re.sub(r'[\s_]+', '_', filename)
        
        # Limit length while preserving extension
        if len(filename) > max_length:
            name, ext = os.path.splitext(filename)
            max_name_length = max_length - len(ext)
            filename = name[:max_name_length].rstrip('_. ') + ext
        
        # Ensure filename is not empty
        if not filename or filename in ['.', '..']:
            filename = 'untitled'
        
        return filename
    
    def sanitize_course_name(self, course_name: str) -> str:
        """Sanitize course name for directory creation."""
        # Similar to filename but more restrictive for directory names
        course_name = unicodedata.normalize('NFKD', course_name)
        course_name = re.sub(r'[<>:"/\\|?*]', '_', course_name)
        course_name = ''.join(char for char in course_name if ord(char) >= 32)
        course_name = course_name.strip('. ')
        course_name = re.sub(r'[\s_]+', '_', course_name)
        
        # Limit length for directories
        if len(course_name) > 100:
            course_name = course_name[:100].rstrip('_. ')
        
        if not course_name:
            course_name = 'Untitled_Course'
        
        return course_name
    
    def get_file_category(self, filename: str, mime_type: Optional[str] = None) -> str:
        """Determine file category based on extension or MIME type."""
        # Get extension from filename
        _, ext = os.path.splitext(filename.lower())
        
        # If no extension but we have MIME type, try to get extension
        if not ext and mime_type:
            ext = self.MIME_EXTENSIONS.get(mime_type, '')
        
        # Find category
        for category, extensions in self.FILE_CATEGORIES.items():
            if ext in extensions:
                return category
        
        return 'Other'
    
    def get_course_directory(self, course_name: str, create: bool = True) -> Path:
        """Get or create course directory."""
        safe_course_name = self.sanitize_course_name(course_name)
        course_dir = self.base_dir / safe_course_name
        
        if create:
            course_dir.mkdir(exist_ok=True)
            
            # Create category subdirectories
            for category in self.FILE_CATEGORIES.keys():
                category_dir = course_dir / category
                category_dir.mkdir(exist_ok=True)
        
        return course_dir
    
    def get_file_path(self, course_name: str, filename: str, 
                     mime_type: Optional[str] = None, ensure_unique: bool = True) -> Path:
        """Get full file path with proper categorization."""
        # Handle uncategorized materials
        if not course_name or course_name.lower() in ['uncategorized', '']:
            course_name = 'Uncategorized'
        
        # Get course directory
        course_dir = self.get_course_directory(course_name)
        
        # Sanitize filename
        safe_filename = self.sanitize_filename(filename)
        
        # Add extension if missing but MIME type is known
        if not os.path.splitext(safe_filename)[1] and mime_type:
            if mime_type in self.MIME_EXTENSIONS:
                safe_filename += self.MIME_EXTENSIONS[mime_type]
        
        # Determine category
        category = self.get_file_category(safe_filename, mime_type)
        
        # Get category directory
        category_dir = course_dir / category
        category_dir.mkdir(exist_ok=True)
        
        # Get final file path
        file_path = category_dir / safe_filename
        
        # Ensure uniqueness if requested
        if ensure_unique:
            file_path = self._ensure_unique_filename(file_path)
        
        return file_path
    
    def _ensure_unique_filename(self, file_path: Path) -> Path:
        """Ensure filename is unique by adding counter if necessary."""
        if not file_path.exists():
            return file_path
        
        # Split name and extension
        name = file_path.stem
        extension = file_path.suffix
        parent = file_path.parent
        
        counter = 1
        while True:
            new_name = f"{name}_{counter}{extension}"
            new_path = parent / new_name
            
            if not new_path.exists():
                return new_path
            
            counter += 1
            
            # Prevent infinite loop
            if counter > 9999:
                import uuid
                new_name = f"{name}_{uuid.uuid4().hex[:8]}{extension}"
                return parent / new_name
    
    def calculate_file_hash(self, file_path: Path, algorithm: str = 'sha256') -> str:
        """Calculate hash of a file for deduplication."""
        try:
            hash_obj = hashlib.new(algorithm)
            with open(file_path, 'rb') as f:
                for chunk in iter(lambda: f.read(8192), b""):
                    hash_obj.update(chunk)
            return hash_obj.hexdigest()
        except Exception as e:
            logging.error(f"Error calculating hash for {file_path}: {e}")
            return ""
    
    def check_duplicate_by_hash(self, file_hash: str, course_dirs: Optional[List[str]] = None) -> Optional[Path]:
        """Check if a file with the same hash exists."""
        if not file_hash:
            return None
        
        search_dirs = []
        if course_dirs:
            for course_name in course_dirs:
                course_dir = self.get_course_directory(course_name, create=False)
                if course_dir.exists():
                    search_dirs.append(course_dir)
        else:
            # Search all course directories
            search_dirs = [d for d in self.base_dir.iterdir() if d.is_dir()]
        
        for search_dir in search_dirs:
            for file_path in search_dir.rglob('*'):
                if file_path.is_file():
                    existing_hash = self.calculate_file_hash(file_path)
                    if existing_hash == file_hash:
                        return file_path
        
        return None
    
    def move_file_to_course(self, file_path: Path, new_course_name: str) -> Optional[Path]:
        """Move a file from one course directory to another."""
        try:
            if not file_path.exists():
                logging.error(f"Source file does not exist: {file_path}")
                return None
            
            # Get new course directory
            new_course_dir = self.get_course_directory(new_course_name)
            
            # Determine category and get new path
            category = self.get_file_category(file_path.name)
            new_category_dir = new_course_dir / category
            new_category_dir.mkdir(exist_ok=True)
            
            new_file_path = new_category_dir / file_path.name
            new_file_path = self._ensure_unique_filename(new_file_path)
            
            # Move the file
            shutil.move(str(file_path), str(new_file_path))
            
            logging.info(f"Moved file from {file_path} to {new_file_path}")
            return new_file_path
            
        except Exception as e:
            logging.error(f"Error moving file {file_path} to course {new_course_name}: {e}")
            return None
    
    def get_directory_stats(self) -> Dict[str, Any]:
        """Get statistics about the directory structure."""
        stats = {
            'total_files': 0,
            'total_size': 0,
            'courses': {},
            'by_category': {}
        }
        
        try:
            for course_dir in self.base_dir.iterdir():
                if not course_dir.is_dir():
                    continue
                
                course_stats = {
                    'files': 0,
                    'size': 0,
                    'categories': {}
                }
                
                for category_dir in course_dir.iterdir():
                    if not category_dir.is_dir():
                        continue
                    
                    category_files = 0
                    category_size = 0
                    
                    for file_path in category_dir.rglob('*'):
                        if file_path.is_file():
                            try:
                                file_size = file_path.stat().st_size
                                category_files += 1
                                category_size += file_size
                            except OSError:
                                continue
                    
                    if category_files > 0:
                        course_stats['categories'][category_dir.name] = {
                            'files': category_files,
                            'size': category_size
                        }
                        course_stats['files'] += category_files
                        course_stats['size'] += category_size
                        
                        # Update global category stats
                        if category_dir.name not in stats['by_category']:
                            stats['by_category'][category_dir.name] = {'files': 0, 'size': 0}
                        stats['by_category'][category_dir.name]['files'] += category_files
                        stats['by_category'][category_dir.name]['size'] += category_size
                
                if course_stats['files'] > 0:
                    stats['courses'][course_dir.name] = course_stats
                    stats['total_files'] += course_stats['files']
                    stats['total_size'] += course_stats['size']
            
        except Exception as e:
            logging.error(f"Error calculating directory stats: {e}")
        
        return stats
    
    def cleanup_empty_directories(self):
        """Remove empty directories."""
        try:
            for course_dir in self.base_dir.iterdir():
                if not course_dir.is_dir():
                    continue
                
                # Check category directories
                for category_dir in course_dir.iterdir():
                    if category_dir.is_dir() and not any(category_dir.iterdir()):
                        category_dir.rmdir()
                        logging.info(f"Removed empty directory: {category_dir}")
                
                # Check if course directory is now empty
                if not any(course_dir.iterdir()):
                    course_dir.rmdir()
                    logging.info(f"Removed empty course directory: {course_dir}")
                    
        except Exception as e:
            logging.error(f"Error cleaning up empty directories: {e}")
    
    def format_file_size(self, size_bytes: int) -> str:
        """Format file size in human-readable format."""
        if size_bytes == 0:
            return "0 B"
        
        size_names = ["B", "KB", "MB", "GB", "TB"]
        i = 0
        while size_bytes >= 1024 and i < len(size_names) - 1:
            size_bytes /= 1024.0
            i += 1
        
        return f"{size_bytes:.1f} {size_names[i]}"
