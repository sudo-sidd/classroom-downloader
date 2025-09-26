import asyncio
import aiohttp
import aiofiles
import logging
import time
import hashlib
from typing import Dict, Any, List, Optional, Callable
from pathlib import Path
from datetime import datetime
import io
from concurrent.futures import ThreadPoolExecutor
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaIoBaseDownload
import requests

from backend.auth import GoogleAPIAuth
from backend.file_manager import FileSystemManager
from backend.database import DatabaseManager


class DownloadProgress:
    """Tracks download progress for individual files and overall session."""
    
    def __init__(self):
        self.session_id = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.total_files = 0
        self.completed_files = 0
        self.failed_files = 0
        self.current_file = ""
        self.current_progress = 0.0
        self.start_time = time.time()
        self.errors: List[str] = []
        self.duplicates_skipped = 0
        self.files_processed: List[Dict[str, Any]] = []
    
    def update_current_file(self, filename: str, progress: float = 0.0):
        """Update current file being processed."""
        self.current_file = filename
        self.current_progress = progress
    
    def complete_file(self, filename: str, success: bool, error: str = ""):
        """Mark a file as completed."""
        if success:
            self.completed_files += 1
        else:
            self.failed_files += 1
            if error:
                self.errors.append(f"{filename}: {error}")
        
        self.files_processed.append({
            'filename': filename,
            'success': success,
            'error': error,
            'timestamp': datetime.now().isoformat()
        })
    
    def skip_duplicate(self, filename: str):
        """Mark a file as skipped due to duplication."""
        self.duplicates_skipped += 1
        self.files_processed.append({
            'filename': filename,
            'success': True,
            'error': "Skipped - duplicate",
            'timestamp': datetime.now().isoformat()
        })
    
    def get_overall_progress(self) -> float:
        """Get overall progress percentage."""
        if self.total_files == 0:
            return 0.0
        return ((self.completed_files + self.failed_files + self.duplicates_skipped) / self.total_files) * 100
    
    def get_status_dict(self) -> Dict[str, Any]:
        """Get current status as dictionary."""
        return {
            'session_id': self.session_id,
            'total_files': self.total_files,
            'completed_files': self.completed_files,
            'failed_files': self.failed_files,
            'duplicates_skipped': self.duplicates_skipped,
            'current_file': self.current_file,
            'current_progress': self.current_progress,
            'overall_progress': self.get_overall_progress(),
            'elapsed_time': time.time() - self.start_time,
            'errors': self.errors[-10:],  # Last 10 errors
            'is_complete': (self.completed_files + self.failed_files + self.duplicates_skipped) >= self.total_files
        }


class FileDownloader:
    """Handles downloading and processing of classroom materials."""
    
    def __init__(self, auth_manager: GoogleAPIAuth, file_manager: FileSystemManager, 
                 db_manager: DatabaseManager, max_concurrent: int = 5):
        """Initialize downloader with required managers."""
        self.auth = auth_manager
        self.file_manager = file_manager
        self.db = db_manager
        self.max_concurrent = max_concurrent
        self.progress = DownloadProgress()
        self.progress_callback: Optional[Callable] = None
        self.drive_service = None
        self.session = None
        
        # Rate limiting
        self.request_delay = 0.1  # Seconds between requests
        self.last_request_time = 0
        
        # Export formats for Google native files
        self.export_formats = {
            'application/vnd.google-apps.document': 'application/pdf',
            'application/vnd.google-apps.presentation': 'application/pdf', 
            'application/vnd.google-apps.spreadsheet': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.google-apps.drawing': 'application/pdf'
        }
    
    def set_progress_callback(self, callback: Callable):
        """Set callback function for progress updates."""
        self.progress_callback = callback
    
    def _update_progress(self):
        """Update progress and call callback if set."""
        if self.progress_callback:
            self.progress_callback(self.progress.get_status_dict())
    
    async def _rate_limit(self):
        """Apply rate limiting between requests."""
        now = time.time()
        elapsed = now - self.last_request_time
        if elapsed < self.request_delay:
            await asyncio.sleep(self.request_delay - elapsed)
        self.last_request_time = time.time()
    
    def _get_drive_service(self):
        """Get authenticated Drive service."""
        if not self.drive_service:
            self.drive_service = self.auth.get_drive_service()
        return self.drive_service
    
    async def _get_file_metadata(self, file_id: str) -> Optional[Dict[str, Any]]:
        """Get file metadata from Drive API."""
        try:
            await self._rate_limit()
            
            # Use requests for async compatibility
            headers = {'Authorization': f'Bearer {self.auth.creds.token}'}
            url = f'https://www.googleapis.com/drive/v3/files/{file_id}'
            params = {'fields': 'id,name,mimeType,size,md5Checksum,createdTime,modifiedTime,parents'}
            
            async with aiohttp.ClientSession() as session:
                async with session.get(url, headers=headers, params=params) as response:
                    if response.status == 200:
                        return await response.json()
                    else:
                        logging.error(f"Failed to get metadata for file {file_id}: {response.status}")
                        return None
                        
        except Exception as e:
            logging.error(f"Error getting metadata for file {file_id}: {e}")
            return None
    
    async def _download_file_content(self, file_id: str, export_mime_type: Optional[str] = None) -> Optional[bytes]:
        """Download file content from Drive API."""
        try:
            await self._rate_limit()
            
            headers = {'Authorization': f'Bearer {self.auth.creds.token}'}
            
            if export_mime_type:
                # Export Google native file
                url = f'https://www.googleapis.com/drive/v3/files/{file_id}/export'
                params = {'mimeType': export_mime_type}
            else:
                # Download regular file
                url = f'https://www.googleapis.com/drive/v3/files/{file_id}'
                params = {'alt': 'media'}
            
            async with aiohttp.ClientSession() as session:
                async with session.get(url, headers=headers, params=params) as response:
                    if response.status == 200:
                        return await response.read()
                    elif response.status == 403:
                        logging.warning(f"Access denied for file {file_id}")
                        return None
                    else:
                        logging.error(f"Failed to download file {file_id}: {response.status}")
                        return None
                        
        except Exception as e:
            logging.error(f"Error downloading file {file_id}: {e}")
            return None
    
    async def _process_drive_file(self, attachment: Dict[str, Any]) -> bool:
        """Process a Google Drive file attachment."""
        try:
            file_id = attachment.get('drive_file_id')
            if not file_id:
                logging.error("No drive file ID found")
                return False
            
            # Get file metadata
            metadata = await self._get_file_metadata(file_id)
            if not metadata:
                return False
            
            original_name = metadata.get('name', attachment.get('title', 'Untitled'))
            mime_type = metadata.get('mimeType', 'application/octet-stream')
            file_size = int(metadata.get('size', 0)) if metadata.get('size') else 0
            
            # Determine if this is a Google native file that needs export
            export_mime_type = self.export_formats.get(mime_type)
            if export_mime_type:
                # Update filename extension for export
                name_without_ext = original_name.rsplit('.', 1)[0] if '.' in original_name else original_name
                if export_mime_type == 'application/pdf':
                    filename = f"{name_without_ext}.pdf"
                elif export_mime_type == 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
                    filename = f"{name_without_ext}.xlsx"
                else:
                    filename = original_name
            else:
                filename = original_name
            
            self.progress.update_current_file(filename, 0.0)
            self._update_progress()
            
            # Check for duplicates using MD5 if available
            md5_checksum = metadata.get('md5Checksum')
            if md5_checksum:
                existing_file = self.db.check_duplicate_by_hash(md5_checksum)
                if existing_file:
                    logging.info(f"Skipping duplicate file: {filename}")
                    self.progress.skip_duplicate(filename)
                    self._update_progress()
                    return True
            
            # Get file path
            course_name = attachment.get('course_name', 'Uncategorized')
            file_path = self.file_manager.get_file_path(
                course_name, filename, export_mime_type or mime_type
            )
            
            # Download file content
            self.progress.update_current_file(filename, 50.0)
            self._update_progress()
            
            content = await self._download_file_content(file_id, export_mime_type)
            if content is None:
                self.progress.complete_file(filename, False, "Failed to download content")
                self._update_progress()
                return False
            
            # Save file
            async with aiofiles.open(file_path, 'wb') as f:
                await f.write(content)
            
            # Calculate hash for deduplication
            file_hash = hashlib.sha256(content).hexdigest()
            
            # Update progress
            self.progress.update_current_file(filename, 100.0)
            self._update_progress()
            
            # Save to database
            material_data = {
                'title': filename,
                'date_created': attachment.get('creation_time'),
                'date_updated': attachment.get('update_time'),
                'mime_type': export_mime_type or mime_type,
                'course_id': attachment.get('course_id'),
                'course_name': course_name,
                'local_path': str(file_path),
                'remote_id': file_id,
                'file_size': len(content),
                'file_hash': file_hash,
                'material_type': attachment.get('material_type', 'ATTACHMENT'),
                'original_url': f"https://drive.google.com/file/d/{file_id}/view",
                'description': attachment.get('material_description', '')
            }
            
            success = self.db.add_material(material_data)
            if success:
                self.progress.complete_file(filename, True)
                logging.info(f"Successfully downloaded: {filename}")
            else:
                self.progress.complete_file(filename, False, "Database save failed")
            
            self._update_progress()
            return success
            
        except Exception as e:
            error_msg = f"Error processing drive file: {e}"
            logging.error(error_msg)
            self.progress.complete_file(attachment.get('title', 'Unknown'), False, error_msg)
            self._update_progress()
            return False
    
    async def _process_youtube_video(self, attachment: Dict[str, Any]) -> bool:
        """Process a YouTube video attachment (save metadata only)."""
        try:
            youtube_id = attachment.get('youtube_id')
            title = attachment.get('title', 'YouTube Video')
            
            # Create a text file with video information
            content = f"""YouTube Video: {title}
Video ID: {youtube_id}
URL: https://www.youtube.com/watch?v={youtube_id}
Thumbnail: {attachment.get('thumbnail_url', '')}
Material: {attachment.get('material_title', '')}
Description: {attachment.get('material_description', '')}
Date: {attachment.get('creation_time', '')}
"""
            
            filename = f"{self.file_manager.sanitize_filename(title)}.txt"
            course_name = attachment.get('course_name', 'Uncategorized')
            file_path = self.file_manager.get_file_path(course_name, filename, 'text/plain')
            
            async with aiofiles.open(file_path, 'w', encoding='utf-8') as f:
                await f.write(content)
            
            file_hash = hashlib.sha256(content.encode('utf-8')).hexdigest()
            
            # Save to database
            material_data = {
                'title': title,
                'date_created': attachment.get('creation_time'),
                'date_updated': attachment.get('update_time'),
                'mime_type': 'text/plain',
                'course_id': attachment.get('course_id'),
                'course_name': course_name,
                'local_path': str(file_path),
                'remote_id': youtube_id,
                'file_size': len(content.encode('utf-8')),
                'file_hash': file_hash,
                'material_type': 'YOUTUBE_VIDEO',
                'original_url': f"https://www.youtube.com/watch?v={youtube_id}",
                'description': attachment.get('material_description', '')
            }
            
            success = self.db.add_material(material_data)
            self.progress.complete_file(filename, success, "" if success else "Database save failed")
            self._update_progress()
            return success
            
        except Exception as e:
            error_msg = f"Error processing YouTube video: {e}"
            logging.error(error_msg)
            self.progress.complete_file(attachment.get('title', 'YouTube Video'), False, error_msg)
            self._update_progress()
            return False
    
    async def _process_link(self, attachment: Dict[str, Any]) -> bool:
        """Process a web link attachment."""
        try:
            url = attachment.get('url')
            title = attachment.get('title', 'Web Link')
            
            content = f"""Web Link: {title}
URL: {url}
Material: {attachment.get('material_title', '')}
Description: {attachment.get('material_description', '')}
Date: {attachment.get('creation_time', '')}
"""
            
            filename = f"{self.file_manager.sanitize_filename(title)}.txt"
            course_name = attachment.get('course_name', 'Uncategorized')
            file_path = self.file_manager.get_file_path(course_name, filename, 'text/plain')
            
            async with aiofiles.open(file_path, 'w', encoding='utf-8') as f:
                await f.write(content)
            
            file_hash = hashlib.sha256(content.encode('utf-8')).hexdigest()
            
            # Save to database
            material_data = {
                'title': title,
                'date_created': attachment.get('creation_time'),
                'date_updated': attachment.get('update_time'),
                'mime_type': 'text/plain',
                'course_id': attachment.get('course_id'),
                'course_name': course_name,
                'local_path': str(file_path),
                'remote_id': url,
                'file_size': len(content.encode('utf-8')),
                'file_hash': file_hash,
                'material_type': 'WEB_LINK',
                'original_url': url,
                'description': attachment.get('material_description', '')
            }
            
            success = self.db.add_material(material_data)
            self.progress.complete_file(filename, success, "" if success else "Database save failed")
            self._update_progress()
            return success
            
        except Exception as e:
            error_msg = f"Error processing link: {e}"
            logging.error(error_msg)
            self.progress.complete_file(attachment.get('title', 'Web Link'), False, error_msg)
            self._update_progress()
            return False
    
    async def _process_single_attachment(self, attachment: Dict[str, Any]) -> bool:
        """Process a single attachment based on its type."""
        attachment_type = attachment.get('type', 'unknown')
        
        if attachment_type == 'drive_file':
            return await self._process_drive_file(attachment)
        elif attachment_type == 'youtube_video':
            return await self._process_youtube_video(attachment)
        elif attachment_type == 'link':
            return await self._process_link(attachment)
        elif attachment_type == 'form':
            # Similar to link processing for forms
            form_attachment = {**attachment, 'url': attachment.get('form_url'), 'type': 'link'}
            return await self._process_link(form_attachment)
        else:
            logging.warning(f"Unknown attachment type: {attachment_type}")
            self.progress.complete_file(
                attachment.get('title', 'Unknown'), 
                False, 
                f"Unsupported attachment type: {attachment_type}"
            )
            self._update_progress()
            return False
    
    async def download_attachments(self, attachments: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Download multiple attachments with parallel processing."""
        self.progress = DownloadProgress()
        self.progress.total_files = len(attachments)
        
        logging.info(f"Starting download of {len(attachments)} attachments")
        self._update_progress()
        
        # Process attachments with concurrency limit
        semaphore = asyncio.Semaphore(self.max_concurrent)
        
        async def process_with_semaphore(attachment):
            async with semaphore:
                return await self._process_single_attachment(attachment)
        
        # Execute downloads
        tasks = [process_with_semaphore(attachment) for attachment in attachments]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Count results
        successful = sum(1 for r in results if r is True)
        failed = len(results) - successful
        
        final_status = self.progress.get_status_dict()
        final_status.update({
            'final_successful': successful,
            'final_failed': failed,
            'total_processed': len(attachments)
        })
        
        logging.info(f"Download completed: {successful} successful, {failed} failed")
        return final_status
    
    def get_current_progress(self) -> Dict[str, Any]:
        """Get current download progress."""
        return self.progress.get_status_dict()
