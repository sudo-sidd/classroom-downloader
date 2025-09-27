import logging
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timedelta
import time
from googleapiclient.errors import HttpError
from backend.auth import GoogleAPIAuth


class ClassroomAPIClient:
    """Client for interacting with Google Classroom API."""
    
    def __init__(self, auth_manager: GoogleAPIAuth):
        """Initialize with authentication manager."""
        self.auth = auth_manager
        self.classroom_service = None
        self.drive_service = None
        
    def _get_services(self):
        """Get authenticated services."""
        if not self.classroom_service:
            self.classroom_service = self.auth.get_classroom_service()
        if not self.drive_service:
            self.drive_service = self.auth.get_drive_service()
    
    def get_courses(self, active_only: bool = True) -> List[Dict[str, Any]]:
        """Fetch all courses accessible to the user."""
        try:
            self._get_services()
            courses = []
            page_token = None
            
            while True:
                request = self.classroom_service.courses().list(
                    pageSize=100,
                    pageToken=page_token,
                    courseStates=['ACTIVE'] if active_only else None
                )
                
                response = request.execute()
                
                if 'courses' in response:
                    for course in response['courses']:
                        courses.append({
                            'id': course.get('id'),
                            'name': course.get('name'),
                            'section': course.get('section', ''),
                            'description': course.get('description', ''),
                            'room': course.get('room', ''),
                            'ownerId': course.get('ownerId'),
                            'creationTime': course.get('creationTime'),
                            'updateTime': course.get('updateTime'),
                            'enrollmentCode': course.get('enrollmentCode', ''),
                            'courseState': course.get('courseState'),
                            'alternateLink': course.get('alternateLink')
                        })
                
                page_token = response.get('nextPageToken')
                if not page_token:
                    break
                
                # Add delay to respect rate limits
                time.sleep(0.1)
            
            logging.info(f"Fetched {len(courses)} courses")
            return courses
            
        except HttpError as e:
            logging.error(f"HTTP error fetching courses: {e}")
            raise
        except Exception as e:
            logging.error(f"Error fetching courses: {e}")
            raise
    
    def get_coursework(self, course_id: str, start_date: Optional[datetime] = None, 
                      end_date: Optional[datetime] = None) -> List[Dict[str, Any]]:
        """Fetch coursework for a specific course."""
        try:
            self._get_services()
            coursework_items = []
            page_token = None
            
            while True:
                request = self.classroom_service.courses().courseWork().list(
                    courseId=course_id,
                    pageSize=100,
                    pageToken=page_token,
                    orderBy='updateTime desc'
                )
                
                response = request.execute()
                
                if 'courseWork' in response:
                    for work in response['courseWork']:
                        # Parse creation time
                        creation_time = work.get('creationTime')
                        if creation_time and (start_date or end_date):
                            work_date = datetime.fromisoformat(creation_time.replace('Z', '+00:00'))
                            if start_date and work_date < start_date:
                                continue
                            if end_date and work_date > end_date:
                                continue
                        
                        coursework_item = {
                            'id': work.get('id'),
                            'courseId': course_id,
                            'title': work.get('title'),
                            'description': work.get('description', ''),
                            'materials': work.get('materials', []),
                            'state': work.get('state'),
                            'creationTime': creation_time,
                            'updateTime': work.get('updateTime'),
                            'dueDate': work.get('dueDate'),
                            'dueTime': work.get('dueTime'),
                            'workType': work.get('workType', 'ASSIGNMENT'),
                            'associatedWithDeveloper': work.get('associatedWithDeveloper', False),
                            'alternateLink': work.get('alternateLink'),
                            'maxPoints': work.get('maxPoints', 0),
                            'submissionModificationMode': work.get('submissionModificationMode')
                        }
                        coursework_items.append(coursework_item)
                
                page_token = response.get('nextPageToken')
                if not page_token:
                    break
                
                time.sleep(0.1)
            
            logging.info(f"Fetched {len(coursework_items)} coursework items for course {course_id}")
            return coursework_items
            
        except HttpError as e:
            logging.error(f"HTTP error fetching coursework for course {course_id}: {e}")
            return []
        except Exception as e:
            logging.error(f"Error fetching coursework for course {course_id}: {e}")
            return []
    
    def get_coursework_materials(self, course_id: str, start_date: Optional[datetime] = None,
                               end_date: Optional[datetime] = None) -> List[Dict[str, Any]]:
        """Fetch coursework materials for a specific course."""
        try:
            self._get_services()
            materials = []
            page_token = None
            
            while True:
                request = self.classroom_service.courses().courseWorkMaterials().list(
                    courseId=course_id,
                    pageSize=100,
                    pageToken=page_token,
                    orderBy='updateTime desc'
                )
                
                response = request.execute()
                
                if 'courseWorkMaterial' in response:
                    for material in response['courseWorkMaterial']:
                        # Parse creation time
                        creation_time = material.get('creationTime')
                        if creation_time and (start_date or end_date):
                            material_date = datetime.fromisoformat(creation_time.replace('Z', '+00:00'))
                            if start_date and material_date < start_date:
                                continue
                            if end_date and material_date > end_date:
                                continue
                        
                        material_item = {
                            'id': material.get('id'),
                            'courseId': course_id,
                            'title': material.get('title'),
                            'description': material.get('description', ''),
                            'materials': material.get('materials', []),
                            'state': material.get('state'),
                            'creationTime': creation_time,
                            'updateTime': material.get('updateTime'),
                            'alternateLink': material.get('alternateLink'),
                            'workType': 'COURSE_WORK_MATERIAL'
                        }
                        materials.append(material_item)
                
                page_token = response.get('nextPageToken')
                if not page_token:
                    break
                
                time.sleep(0.1)
            
            logging.info(f"Fetched {len(materials)} coursework materials for course {course_id}")
            return materials
            
        except HttpError as e:
            logging.error(f"HTTP error fetching coursework materials for course {course_id}: {e}")
            return []
        except Exception as e:
            logging.error(f"Error fetching coursework materials for course {course_id}: {e}")
            return []
    
    def get_announcements(self, course_id: str, start_date: Optional[datetime] = None,
                         end_date: Optional[datetime] = None) -> List[Dict[str, Any]]:
        """Fetch announcements for a specific course."""
        try:
            self._get_services()
            announcements = []
            page_token = None
            
            while True:
                request = self.classroom_service.courses().announcements().list(
                    courseId=course_id,
                    pageSize=100,
                    pageToken=page_token,
                    orderBy='updateTime desc'
                )
                
                response = request.execute()
                
                if 'announcements' in response:
                    for announcement in response['announcements']:
                        # Parse creation time
                        creation_time = announcement.get('creationTime')
                        if creation_time and (start_date or end_date):
                            announcement_date = datetime.fromisoformat(creation_time.replace('Z', '+00:00'))
                            if start_date and announcement_date < start_date:
                                continue
                            if end_date and announcement_date > end_date:
                                continue
                        
                        announcement_item = {
                            'id': announcement.get('id'),
                            'courseId': course_id,
                            'title': announcement.get('text', 'Announcement')[:100],
                            'description': announcement.get('text', ''),
                            'materials': announcement.get('materials', []),
                            'state': announcement.get('state'),
                            'creationTime': creation_time,
                            'updateTime': announcement.get('updateTime'),
                            'alternateLink': announcement.get('alternateLink'),
                            'workType': 'ANNOUNCEMENT'
                        }
                        announcements.append(announcement_item)
                
                page_token = response.get('nextPageToken')
                if not page_token:
                    break
                
                time.sleep(0.1)
            
            logging.info(f"Fetched {len(announcements)} announcements for course {course_id}")
            return announcements
            
        except HttpError as e:
            logging.error(f"HTTP error fetching announcements for course {course_id}: {e}")
            return []
        except Exception as e:
            logging.error(f"Error fetching announcements for course {course_id}: {e}")
            return []
    
    def get_all_materials(self, course_ids: List[str], start_date: Optional[datetime] = None,
                         end_date: Optional[datetime] = None) -> Dict[str, List[Dict[str, Any]]]:
        """Fetch all materials (coursework, materials, announcements) for multiple courses."""
        all_materials = {}
        
        for course_id in course_ids:
            try:
                logging.info(f"Fetching materials for course {course_id}")
                
                # Get course information
                course = self.classroom_service.courses().get(id=course_id).execute()
                course_name = course.get('name', f'Course_{course_id}')
                
                materials = []
                
                # Fetch coursework
                coursework = self.get_coursework(course_id, start_date, end_date)
                materials.extend(coursework)
                
                # Fetch coursework materials
                coursework_materials = self.get_coursework_materials(course_id, start_date, end_date)
                materials.extend(coursework_materials)
                
                # Fetch announcements
                announcements = self.get_announcements(course_id, start_date, end_date)
                materials.extend(announcements)
                
                all_materials[course_id] = {
                    'course_name': course_name,
                    'course_info': course,
                    'materials': materials
                }
                
                # Add delay between courses to respect rate limits
                time.sleep(0.5)
                
            except Exception as e:
                logging.error(f"Error fetching materials for course {course_id}: {e}")
                all_materials[course_id] = {
                    'course_name': f'Course_{course_id}',
                    'course_info': {},
                    'materials': []
                }
        
        return all_materials
    
    def extract_attachments(self, materials_data: Dict[str, List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
        """Extract all attachments from materials data."""
        all_attachments = []
        
        for course_id, course_data in materials_data.items():
            course_name = course_data.get('course_name', f'Course_{course_id}')
            materials = course_data.get('materials', [])
            
            for material in materials:
                material_attachments = material.get('materials', [])
                
                for attachment in material_attachments:
                    attachment_info = {
                        'course_id': course_id,
                        'course_name': course_name,
                        'material_id': material.get('id'),
                        'material_title': material.get('title', 'Untitled'),
                        'material_description': material.get('description', ''),
                        'material_type': material.get('workType', 'UNKNOWN'),
                        'creation_time': material.get('creationTime'),
                        'update_time': material.get('updateTime')
                    }
                    
                    # Process different attachment types
                    if 'driveFile' in attachment:
                        # Classroom API schema: attachment.driveFile.driveFile.{id,title,thumbnailUrl,alternateLink}
                        df = attachment.get('driveFile') or {}
                        inner = df.get('driveFile') or df  # be tolerant to both shapes
                        attachment_info.update({
                            'type': 'drive_file',
                            'drive_file_id': inner.get('id'),
                            'title': inner.get('title', 'Untitled'),
                            'thumbnail_url': inner.get('thumbnailUrl'),
                            'alternate_link': inner.get('alternateLink')
                        })
                    elif 'youTubeVideo' in attachment:
                        youtube_video = attachment['youTubeVideo']
                        attachment_info.update({
                            'type': 'youtube_video',
                            'youtube_id': youtube_video.get('id'),
                            'title': youtube_video.get('title', 'Untitled Video'),
                            'thumbnail_url': youtube_video.get('thumbnailUrl'),
                            'alternate_link': youtube_video.get('alternateLink')
                        })
                    elif 'link' in attachment:
                        link = attachment['link']
                        attachment_info.update({
                            'type': 'link',
                            'url': link.get('url'),
                            'title': link.get('title', 'Link'),
                            'thumbnail_url': link.get('thumbnailUrl')
                        })
                    elif 'form' in attachment:
                        form = attachment['form']
                        attachment_info.update({
                            'type': 'form',
                            'form_url': form.get('formUrl'),
                            'title': form.get('title', 'Form'),
                            'thumbnail_url': form.get('thumbnailUrl')
                        })
                    else:
                        attachment_info.update({
                            'type': 'unknown',
                            'title': 'Unknown Attachment',
                            'raw_data': attachment
                        })
                    
                    all_attachments.append(attachment_info)
        
        logging.info(f"Extracted {len(all_attachments)} attachments from materials")
        return all_attachments
