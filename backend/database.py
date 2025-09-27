import sqlite3
import logging
import os
from datetime import datetime
from typing import Optional, List, Dict, Any


class DatabaseManager:
    """Manages SQLite database operations for the classroom materials index."""
    
    def __init__(self, db_path: str = "classroom_materials.db"):
        """Initialize database connection and create tables if they don't exist."""
        self.db_path = db_path
        self.init_database()
        
    def init_database(self):
        """Create database tables if they don't exist."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                
                # Materials table
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS materials (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        title TEXT NOT NULL,
                        date_created TEXT,
                        date_updated TEXT,
                        mime_type TEXT,
                        course_id TEXT,
                        course_name TEXT,
                        local_path TEXT,
                        remote_id TEXT UNIQUE,
                        file_size INTEGER,
                        file_hash TEXT,
                        material_type TEXT,
                        download_date TEXT,
                        is_duplicate INTEGER DEFAULT 0,
                        original_url TEXT,
                        description TEXT
                    )
                """)
                
                # Courses table
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS courses (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        description TEXT,
                        enrollment_code TEXT,
                        owner_id TEXT,
                        creation_time TEXT,
                        update_time TEXT,
                        last_sync TEXT
                    )
                """)
                
                # Download sessions table
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS download_sessions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        session_id TEXT UNIQUE,
                        start_time TEXT,
                        end_time TEXT,
                        total_files INTEGER DEFAULT 0,
                        successful_downloads INTEGER DEFAULT 0,
                        failed_downloads INTEGER DEFAULT 0,
                        status TEXT DEFAULT 'active'
                    )
                """)
                
                # Subjects table
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS subjects (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL UNIQUE,
                        keywords TEXT NOT NULL,
                        priority INTEGER DEFAULT 5,
                        color TEXT DEFAULT '#3498db',
                        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                
                # File classifications table
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS file_classifications (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        material_id INTEGER NOT NULL,
                        subject_id INTEGER NOT NULL,
                        classification_type TEXT NOT NULL CHECK(classification_type IN ('auto', 'manual')),
                        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (material_id) REFERENCES materials (id) ON DELETE CASCADE,
                        FOREIGN KEY (subject_id) REFERENCES subjects (id) ON DELETE CASCADE,
                        UNIQUE(material_id)
                    )
                """)

                # Create indexes for better performance
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_materials_course_id ON materials(course_id)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_materials_mime_type ON materials(mime_type)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_materials_date ON materials(date_created)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_materials_remote_id ON materials(remote_id)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_materials_hash ON materials(file_hash)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_classifications_material ON file_classifications(material_id)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_classifications_subject ON file_classifications(subject_id)")
                
                conn.commit()
                logging.info("Database initialized successfully")
                
        except sqlite3.Error as e:
            logging.error(f"Database initialization error: {e}")
            raise
    
    def add_course(self, course_data: Dict[str, Any]) -> bool:
        """Add or update a course in the database."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT OR REPLACE INTO courses 
                    (id, name, description, enrollment_code, owner_id, creation_time, update_time, last_sync)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    course_data.get('id'),
                    course_data.get('name'),
                    course_data.get('description', ''),
                    course_data.get('enrollmentCode', ''),
                    course_data.get('ownerId'),
                    course_data.get('creationTime'),
                    course_data.get('updateTime'),
                    datetime.now().isoformat()
                ))
                conn.commit()
                return True
        except sqlite3.Error as e:
            logging.error(f"Error adding course {course_data.get('id')}: {e}")
            return False
    
    def add_material(self, material_data: Dict[str, Any]) -> bool:
        """Add a new material to the database."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT OR REPLACE INTO materials 
                    (title, date_created, date_updated, mime_type, course_id, course_name, 
                     local_path, remote_id, file_size, file_hash, material_type, 
                     download_date, is_duplicate, original_url, description)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    material_data.get('title'),
                    material_data.get('date_created'),
                    material_data.get('date_updated'),
                    material_data.get('mime_type'),
                    material_data.get('course_id'),
                    material_data.get('course_name'),
                    material_data.get('local_path'),
                    material_data.get('remote_id'),
                    material_data.get('file_size', 0),
                    material_data.get('file_hash'),
                    material_data.get('material_type'),
                    datetime.now().isoformat(),
                    material_data.get('is_duplicate', 0),
                    material_data.get('original_url'),
                    material_data.get('description', '')
                ))
                conn.commit()
                return True
        except sqlite3.Error as e:
            logging.error(f"Error adding material {material_data.get('title')}: {e}")
            return False
    
    def get_materials_by_course(self, course_id: str) -> List[Dict[str, Any]]:
        """Get all materials for a specific course."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT * FROM materials 
                    WHERE course_id = ? 
                    ORDER BY date_created DESC
                """, (course_id,))
                return [dict(row) for row in cursor.fetchall()]
        except sqlite3.Error as e:
            logging.error(f"Error getting materials for course {course_id}: {e}")
            return []
    
    def get_all_courses(self) -> List[Dict[str, Any]]:
        """Get all courses from the database."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM courses ORDER BY name")
                return [dict(row) for row in cursor.fetchall()]
        except sqlite3.Error as e:
            logging.error(f"Error getting courses: {e}")
            return []
    
    def check_duplicate_by_hash(self, file_hash: str) -> Optional[Dict[str, Any]]:
        """Check if a file with the same hash already exists."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT * FROM materials 
                    WHERE file_hash = ? AND is_duplicate = 0
                    LIMIT 1
                """, (file_hash,))
                result = cursor.fetchone()
                return dict(result) if result else None
        except sqlite3.Error as e:
            logging.error(f"Error checking duplicate by hash: {e}")
            return None
    
    def search_materials(self, query: str, course_id: Optional[str] = None, 
                        mime_type: Optional[str] = None) -> List[Dict[str, Any]]:
        """Search materials by title, description, or other criteria."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                
                sql = """
                    SELECT * FROM materials 
                    WHERE (title LIKE ? OR description LIKE ?)
                """
                params = [f"%{query}%", f"%{query}%"]
                
                if course_id:
                    sql += " AND course_id = ?"
                    params.append(course_id)
                
                if mime_type:
                    sql += " AND mime_type LIKE ?"
                    params.append(f"%{mime_type}%")
                
                sql += " ORDER BY date_created DESC"
                
                cursor.execute(sql, params)
                return [dict(row) for row in cursor.fetchall()]
        except sqlite3.Error as e:
            logging.error(f"Error searching materials: {e}")
            return []
    
    def update_material_course(self, material_id: int, new_course_id: str, new_course_name: str) -> bool:
        """Update the course assignment for a material."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    UPDATE materials 
                    SET course_id = ?, course_name = ?
                    WHERE id = ?
                """, (new_course_id, new_course_name, material_id))
                conn.commit()
                return cursor.rowcount > 0
        except sqlite3.Error as e:
            logging.error(f"Error updating material course: {e}")
            return False
    
    def get_statistics(self) -> Dict[str, Any]:
        """Get database statistics."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                
                # Total materials
                cursor.execute("SELECT COUNT(*) FROM materials")
                total_materials = cursor.fetchone()[0]
                
                # Materials by course
                cursor.execute("""
                    SELECT course_name, COUNT(*) as count
                    FROM materials 
                    GROUP BY course_id, course_name
                    ORDER BY count DESC
                """)
                by_course = [{"course": row[0], "count": row[1]} for row in cursor.fetchall()]
                
                # Materials by type
                cursor.execute("""
                    SELECT mime_type, COUNT(*) as count
                    FROM materials 
                    GROUP BY mime_type
                    ORDER BY count DESC
                """)
                by_type = [{"type": row[0], "count": row[1]} for row in cursor.fetchall()]
                
                # Uncategorized materials
                cursor.execute("""
                    SELECT COUNT(*) FROM materials 
                    WHERE course_id IS NULL OR course_id = ''
                """)
                uncategorized = cursor.fetchone()[0]
                
                return {
                    "total_materials": total_materials,
                    "by_course": by_course,
                    "by_type": by_type,
                    "uncategorized": uncategorized
                }
        except sqlite3.Error as e:
            logging.error(f"Error getting statistics: {e}")
            return {}
    
    def get_uncategorized_materials(self) -> List[Dict[str, Any]]:
        """Get all materials that are not assigned to a course."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT * FROM materials 
                    WHERE course_id IS NULL OR course_id = '' OR course_name = 'Uncategorized'
                    ORDER BY date_created DESC
                """)
                return [dict(row) for row in cursor.fetchall()]
        except sqlite3.Error as e:
            logging.error(f"Error getting uncategorized materials: {e}")
            return []

    # Subject Management Methods
    def add_subject(self, name: str, keywords: str, priority: int = 5, color: str = '#3498db') -> bool:
        """Add a new subject."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT INTO subjects (name, keywords, priority, color)
                    VALUES (?, ?, ?, ?)
                """, (name, keywords, priority, color))
                conn.commit()
                logging.info(f"Added subject: {name}")
                return True
        except sqlite3.IntegrityError as e:
            logging.error(f"Subject already exists: {name}")
            return False
        except sqlite3.Error as e:
            logging.error(f"Error adding subject: {e}")
            return False

    def get_all_subjects(self) -> List[Dict[str, Any]]:
        """Get all subjects ordered by priority."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT * FROM subjects 
                    ORDER BY priority DESC, name ASC
                """)
                return [dict(row) for row in cursor.fetchall()]
        except sqlite3.Error as e:
            logging.error(f"Error getting subjects: {e}")
            return []

    def update_subject(self, subject_id: int, name: str = None, keywords: str = None, 
                      priority: int = None, color: str = None) -> bool:
        """Update subject information."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                
                # Build update query dynamically
                updates = []
                params = []
                
                if name is not None:
                    updates.append("name = ?")
                    params.append(name)
                if keywords is not None:
                    updates.append("keywords = ?")
                    params.append(keywords)
                if priority is not None:
                    updates.append("priority = ?")
                    params.append(priority)
                if color is not None:
                    updates.append("color = ?")
                    params.append(color)
                
                if updates:
                    updates.append("updated_at = CURRENT_TIMESTAMP")
                    params.append(subject_id)
                    
                    query = f"UPDATE subjects SET {', '.join(updates)} WHERE id = ?"
                    cursor.execute(query, params)
                    conn.commit()
                    return cursor.rowcount > 0
                return False
        except sqlite3.Error as e:
            logging.error(f"Error updating subject: {e}")
            return False

    def delete_subject(self, subject_id: int) -> bool:
        """Delete a subject and all its classifications."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM subjects WHERE id = ?", (subject_id,))
                conn.commit()
                return cursor.rowcount > 0
        except sqlite3.Error as e:
            logging.error(f"Error deleting subject: {e}")
            return False

    def classify_file(self, material_id: int, subject_id: int, classification_type: str = 'manual') -> bool:
        """Classify a file to a subject."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT OR REPLACE INTO file_classifications 
                    (material_id, subject_id, classification_type)
                    VALUES (?, ?, ?)
                """, (material_id, subject_id, classification_type))
                conn.commit()
                return True
        except sqlite3.Error as e:
            logging.error(f"Error classifying file: {e}")
            return False

    def unclassify_file(self, material_id: int) -> bool:
        """Remove classification from a file."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM file_classifications WHERE material_id = ?", (material_id,))
                conn.commit()
                return cursor.rowcount > 0
        except sqlite3.Error as e:
            logging.error(f"Error unclassifying file: {e}")
            return False

    def get_files_by_subject(self, subject_id: int = None) -> Dict[str, List[Dict[str, Any]]]:
        """Get files organized by subject. If subject_id is provided, return only that subject's files."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                
                if subject_id:
                    # Get files for specific subject
                    cursor.execute("""
                        SELECT m.*, fc.classification_type, s.name as subject_name, s.color as subject_color
                        FROM materials m
                        JOIN file_classifications fc ON m.id = fc.material_id
                        JOIN subjects s ON fc.subject_id = s.id
                        WHERE s.id = ?
                        ORDER BY m.date_created DESC
                    """, (subject_id,))
                    files = [dict(row) for row in cursor.fetchall()]
                    return {f"subject_{subject_id}": files}
                else:
                    # Get all classified files organized by subject
                    cursor.execute("""
                        SELECT m.*, fc.classification_type, s.name as subject_name, s.color as subject_color, s.id as subject_id
                        FROM materials m
                        JOIN file_classifications fc ON m.id = fc.material_id
                        JOIN subjects s ON fc.subject_id = s.id
                        ORDER BY s.priority DESC, s.name ASC, m.date_created DESC
                    """)
                    
                    classified_files = [dict(row) for row in cursor.fetchall()]
                    
                    # Get unclassified files
                    cursor.execute("""
                        SELECT m.* FROM materials m
                        LEFT JOIN file_classifications fc ON m.id = fc.material_id
                        WHERE fc.material_id IS NULL
                        ORDER BY m.date_created DESC
                    """)
                    unclassified_files = [dict(row) for row in cursor.fetchall()]
                    
                    # Organize by subject
                    result = {"unclassified": unclassified_files}
                    
                    for file in classified_files:
                        subject_key = f"subject_{file['subject_id']}"
                        if subject_key not in result:
                            result[subject_key] = []
                        result[subject_key].append(file)
                    
                    return result
                    
        except sqlite3.Error as e:
            logging.error(f"Error getting files by subject: {e}")
            return {}

    def get_classification_stats(self) -> Dict[str, Any]:
        """Get statistics about file classifications."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                
                # Total files
                cursor.execute("SELECT COUNT(*) FROM materials")
                total_files = cursor.fetchone()[0]
                
                # Classified files
                cursor.execute("SELECT COUNT(*) FROM file_classifications")
                classified_files = cursor.fetchone()[0]
                
                # Files by subject
                cursor.execute("""
                    SELECT s.name, COUNT(fc.material_id) as count, s.color
                    FROM subjects s
                    LEFT JOIN file_classifications fc ON s.id = fc.subject_id
                    GROUP BY s.id, s.name, s.color
                    ORDER BY count DESC
                """)
                by_subject = [{"subject": row[0], "count": row[1], "color": row[2]} for row in cursor.fetchall()]
                
                # Auto vs manual classifications
                cursor.execute("""
                    SELECT classification_type, COUNT(*) as count
                    FROM file_classifications
                    GROUP BY classification_type
                """)
                by_type = [{"type": row[0], "count": row[1]} for row in cursor.fetchall()]
                
                return {
                    "total_files": total_files,
                    "classified_files": classified_files,
                    "unclassified_files": total_files - classified_files,
                    "by_subject": by_subject,
                    "by_classification_type": by_type
                }
        except sqlite3.Error as e:
            logging.error(f"Error getting classification statistics: {e}")
            return {}
