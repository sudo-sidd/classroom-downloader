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
                
                # Create indexes for better performance
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_materials_course_id ON materials(course_id)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_materials_mime_type ON materials(mime_type)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_materials_date ON materials(date_created)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_materials_remote_id ON materials(remote_id)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_materials_hash ON materials(file_hash)")
                
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
