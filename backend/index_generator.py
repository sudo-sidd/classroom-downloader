import os
import logging
from typing import Dict, Any, List
from pathlib import Path
from datetime import datetime
from backend.database import DatabaseManager
from backend.file_manager import FileSystemManager


class IndexGenerator:
    """Generates HTML index pages for downloaded materials."""
    
    def __init__(self, file_manager: FileSystemManager, db_manager: DatabaseManager):
        """Initialize with file manager and database manager."""
        self.file_manager = file_manager
        self.db_manager = db_manager
    
    def generate_course_index(self, course_id: str, course_name: str) -> bool:
        """Generate an HTML index page for a specific course."""
        try:
            # Get course materials from database
            materials = self.db_manager.get_materials_by_course(course_id)
            
            if not materials:
                logging.info(f"No materials found for course {course_name}")
                return False
            
            # Group materials by category
            categories = {}
            for material in materials:
                # Determine category from file path or mime type
                category = self._get_category_from_material(material)
                if category not in categories:
                    categories[category] = []
                categories[category].append(material)
            
            # Generate HTML content
            html_content = self._generate_course_html(course_name, categories, materials)
            
            # Write HTML file
            course_dir = self.file_manager.get_course_directory(course_name)
            index_path = course_dir / 'index.html'
            
            with open(index_path, 'w', encoding='utf-8') as f:
                f.write(html_content)
            
            logging.info(f"Generated index page for course {course_name}: {index_path}")
            return True
            
        except Exception as e:
            logging.error(f"Error generating index for course {course_name}: {e}")
            return False
    
    def generate_all_course_indexes(self) -> Dict[str, bool]:
        """Generate index pages for all courses."""
        results = {}
        
        try:
            courses = self.db_manager.get_all_courses()
            
            for course in courses:
                course_id = course['id']
                course_name = course['name']
                
                success = self.generate_course_index(course_id, course_name)
                results[course_name] = success
            
            # Generate main index
            self.generate_main_index(courses)
            
        except Exception as e:
            logging.error(f"Error generating course indexes: {e}")
        
        return results
    
    def generate_main_index(self, courses: List[Dict[str, Any]]) -> bool:
        """Generate main index page linking to all courses."""
        try:
            # Get overall statistics
            stats = self.db_manager.get_statistics()
            
            html_content = self._generate_main_html(courses, stats)
            
            # Write main index file
            index_path = self.file_manager.base_dir / 'index.html'
            with open(index_path, 'w', encoding='utf-8') as f:
                f.write(html_content)
            
            logging.info(f"Generated main index page: {index_path}")
            return True
            
        except Exception as e:
            logging.error(f"Error generating main index: {e}")
            return False
    
    def _get_category_from_material(self, material: Dict[str, Any]) -> str:
        """Determine category from material data."""
        local_path = material.get('local_path', '')
        if local_path:
            # Extract category from path
            path_parts = Path(local_path).parts
            for part in reversed(path_parts):
                if part in self.file_manager.FILE_CATEGORIES:
                    return part
        
        # Fallback to mime type categorization
        mime_type = material.get('mime_type', '')
        return self.file_manager.get_file_category('', mime_type)
    
    def _generate_course_html(self, course_name: str, categories: Dict[str, List], 
                            all_materials: List[Dict[str, Any]]) -> str:
        """Generate HTML content for a course index page."""
        
        # Count statistics
        total_files = len(all_materials)
        total_size = sum(material.get('file_size', 0) for material in all_materials)
        
        html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{self._escape_html(course_name)} - Course Materials</title>
    <style>{self._get_index_css()}</style>
</head>
<body>
    <div class="container">
        <header class="header">
            <h1><i class="icon">📚</i> {self._escape_html(course_name)}</h1>
            <div class="stats">
                <span class="stat">📄 {total_files} files</span>
                <span class="stat">💾 {self.file_manager.format_file_size(total_size)}</span>
            </div>
            <div class="navigation">
                <a href="../index.html" class="nav-link">← All Courses</a>
            </div>
        </header>
        
        <main class="main-content">
            <div class="summary-section">
                <h2>Course Summary</h2>
                <div class="category-grid">
"""
        
        # Add category summaries
        for category, materials in categories.items():
            count = len(materials)
            size = sum(material.get('file_size', 0) for material in materials)
            icon = self._get_category_icon(category)
            
            html += f"""
                    <div class="category-summary">
                        <div class="category-icon">{icon}</div>
                        <div class="category-info">
                            <h3>{category}</h3>
                            <p>{count} files • {self.file_manager.format_file_size(size)}</p>
                        </div>
                    </div>
            """
        
        html += """
                </div>
            </div>
            
            <div class="materials-section">
                <h2>All Materials</h2>
        """
        
        # Add materials by category
        for category, materials in sorted(categories.items()):
            if not materials:
                continue
            
            icon = self._get_category_icon(category)
            html += f"""
                <div class="category-section">
                    <h3 class="category-title">
                        <span class="category-icon">{icon}</span>
                        {category} ({len(materials)} files)
                    </h3>
                    <div class="files-list">
            """
            
            # Sort materials by date (newest first)
            sorted_materials = sorted(materials, 
                key=lambda x: x.get('date_created', x.get('download_date', '')), 
                reverse=True)
            
            for material in sorted_materials:
                html += self._generate_file_entry(material)
            
            html += """
                    </div>
                </div>
            """
        
        html += f"""
            </div>
        </main>
        
        <footer class="footer">
            <p>Generated on {datetime.now().strftime('%Y-%m-%d at %H:%M')}</p>
            <p>Google Classroom Downloader</p>
        </footer>
    </div>
</body>
</html>"""
        
        return html
    
    def _generate_main_html(self, courses: List[Dict[str, Any]], 
                          stats: Dict[str, Any]) -> str:
        """Generate HTML content for the main index page."""
        
        html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Google Classroom Materials - Main Index</title>
    <style>{self._get_index_css()}</style>
</head>
<body>
    <div class="container">
        <header class="header">
            <h1><i class="icon">🎓</i> Google Classroom Materials</h1>
            <div class="stats">
                <span class="stat">📄 {stats.get('total_materials', 0)} files</span>
                <span class="stat">📚 {len(courses)} courses</span>
            </div>
        </header>
        
        <main class="main-content">
            <div class="summary-section">
                <h2>Overview</h2>
                <div class="overview-grid">
                    <div class="overview-item">
                        <h3>Total Materials</h3>
                        <p class="big-number">{stats.get('total_materials', 0)}</p>
                    </div>
                    <div class="overview-item">
                        <h3>Active Courses</h3>
                        <p class="big-number">{len(courses)}</p>
                    </div>
                    <div class="overview-item">
                        <h3>File Types</h3>
                        <p class="big-number">{len(stats.get('by_type', []))}</p>
                    </div>
                    <div class="overview-item">
                        <h3>Uncategorized</h3>
                        <p class="big-number">{stats.get('uncategorized', 0)}</p>
                    </div>
                </div>
            </div>
            
            <div class="courses-section">
                <h2>Courses</h2>
                <div class="courses-grid">
        """
        
        # Add course links
        for course in sorted(courses, key=lambda x: x.get('name', '')):
            course_name = course.get('name', 'Unknown Course')
            safe_name = self.file_manager.sanitize_course_name(course_name)
            
            # Get course material count
            materials = self.db_manager.get_materials_by_course(course.get('id', ''))
            material_count = len(materials)
            
            if material_count > 0:
                html += f"""
                    <div class="course-card">
                        <h3><a href="{safe_name}/index.html">{self._escape_html(course_name)}</a></h3>
                        <p>{material_count} materials</p>
                        <div class="course-meta">
                            <span>Updated: {course.get('update_time', 'Unknown')[:10]}</span>
                        </div>
                    </div>
                """
        
        html += """
                </div>
            </div>
            
            <div class="file-types-section">
                <h2>Materials by Type</h2>
                <div class="types-grid">
        """
        
        # Add file type statistics
        for type_info in stats.get('by_type', []):
            mime_type = type_info.get('type', 'Unknown')
            count = type_info.get('count', 0)
            category = self.file_manager.get_file_category('', mime_type)
            icon = self._get_category_icon(category)
            
            html += f"""
                <div class="type-item">
                    <span class="type-icon">{icon}</span>
                    <div class="type-info">
                        <h4>{category}</h4>
                        <p>{count} files</p>
                    </div>
                </div>
            """
        
        html += f"""
                </div>
            </div>
        </main>
        
        <footer class="footer">
            <p>Generated on {datetime.now().strftime('%Y-%m-%d at %H:%M')}</p>
            <p>Google Classroom Downloader</p>
        </footer>
    </div>
</body>
</html>"""
        
        return html
    
    def _generate_file_entry(self, material: Dict[str, Any]) -> str:
        """Generate HTML for a single file entry."""
        title = material.get('title', 'Untitled')
        local_path = material.get('local_path', '')
        file_size = material.get('file_size', 0)
        date_created = material.get('date_created', material.get('download_date', ''))
        
        # Get relative path for linking
        if local_path:
            rel_path = os.path.relpath(local_path, self.file_manager.base_dir)
            rel_path = rel_path.replace('\\', '/')  # Ensure forward slashes for URLs
        else:
            rel_path = '#'
        
        # Format date
        try:
            if date_created:
                date_obj = datetime.fromisoformat(date_created.replace('Z', '+00:00'))
                formatted_date = date_obj.strftime('%Y-%m-%d')
            else:
                formatted_date = 'Unknown'
        except:
            formatted_date = 'Unknown'
        
        return f"""
            <div class="file-entry">
                <div class="file-info">
                    <h4><a href="{rel_path}" target="_blank">{self._escape_html(title)}</a></h4>
                    <div class="file-meta">
                        <span>📅 {formatted_date}</span>
                        <span>💾 {self.file_manager.format_file_size(file_size)}</span>
                    </div>
                </div>
                <div class="file-actions">
                    <a href="{rel_path}" class="action-btn" target="_blank">Open</a>
                </div>
            </div>
        """
    
    def _get_category_icon(self, category: str) -> str:
        """Get emoji icon for a category."""
        icons = {
            'PDFs': '📄',
            'Documents': '📝',
            'Presentations': '📊',
            'Spreadsheets': '📈',
            'Images': '🖼️',
            'Videos': '🎥',
            'Audio': '🎵',
            'Archives': '📦',
            'Web': '🌐',
            'Other': '📋'
        }
        return icons.get(category, '📄')
    
    def _escape_html(self, text: str) -> str:
        """Escape HTML special characters."""
        if not text:
            return ''
        
        return (text.replace('&', '&amp;')
                   .replace('<', '&lt;')
                   .replace('>', '&gt;')
                   .replace('"', '&quot;')
                   .replace("'", '&#x27;'))
    
    def _get_index_css(self) -> str:
        """Get CSS styles for index pages."""
        return """
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f5f7fa;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
        
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 2rem;
            border-radius: 12px;
            margin-bottom: 2rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 1rem;
        }
        
        .header h1 {
            font-size: 2rem;
            font-weight: 600;
        }
        
        .icon {
            font-size: 1.2em;
            margin-right: 0.5rem;
        }
        
        .stats {
            display: flex;
            gap: 1rem;
            flex-wrap: wrap;
        }
        
        .stat {
            background: rgba(255,255,255,0.2);
            padding: 0.5rem 1rem;
            border-radius: 6px;
            font-weight: 500;
        }
        
        .navigation {
            margin-top: 1rem;
        }
        
        .nav-link {
            color: white;
            text-decoration: none;
            padding: 0.5rem 1rem;
            background: rgba(255,255,255,0.2);
            border-radius: 6px;
            transition: background 0.2s;
        }
        
        .nav-link:hover {
            background: rgba(255,255,255,0.3);
        }
        
        .main-content {
            display: flex;
            flex-direction: column;
            gap: 2rem;
        }
        
        .summary-section,
        .materials-section,
        .courses-section,
        .file-types-section {
            background: white;
            padding: 2rem;
            border-radius: 12px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        h2 {
            font-size: 1.5rem;
            margin-bottom: 1.5rem;
            color: #2d3748;
        }
        
        h3 {
            font-size: 1.2rem;
            margin-bottom: 0.5rem;
            color: #4a5568;
        }
        
        .category-grid,
        .overview-grid,
        .courses-grid,
        .types-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem;
        }
        
        .category-summary,
        .overview-item,
        .course-card,
        .type-item {
            padding: 1rem;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            background: #f7fafc;
        }
        
        .category-summary {
            display: flex;
            align-items: center;
            gap: 1rem;
        }
        
        .category-icon,
        .type-icon {
            font-size: 2rem;
        }
        
        .big-number {
            font-size: 2rem;
            font-weight: 700;
            color: #667eea;
        }
        
        .course-card h3 a {
            color: #667eea;
            text-decoration: none;
        }
        
        .course-card h3 a:hover {
            text-decoration: underline;
        }
        
        .course-meta {
            font-size: 0.9rem;
            color: #718096;
            margin-top: 0.5rem;
        }
        
        .category-section {
            margin-bottom: 2rem;
        }
        
        .category-title {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            font-size: 1.3rem;
            margin-bottom: 1rem;
            color: #4a5568;
        }
        
        .files-list {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
        }
        
        .file-entry {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1rem;
            background: #f7fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            transition: background 0.2s;
        }
        
        .file-entry:hover {
            background: #edf2f7;
        }
        
        .file-info h4 {
            margin-bottom: 0.25rem;
        }
        
        .file-info h4 a {
            color: #667eea;
            text-decoration: none;
        }
        
        .file-info h4 a:hover {
            text-decoration: underline;
        }
        
        .file-meta {
            display: flex;
            gap: 1rem;
            font-size: 0.9rem;
            color: #718096;
        }
        
        .action-btn {
            padding: 0.5rem 1rem;
            background: #667eea;
            color: white;
            text-decoration: none;
            border-radius: 6px;
            font-size: 0.9rem;
            transition: background 0.2s;
        }
        
        .action-btn:hover {
            background: #5a67d8;
        }
        
        .footer {
            text-align: center;
            padding: 2rem;
            color: #718096;
            font-size: 0.9rem;
        }
        
        @media (max-width: 768px) {
            .container {
                padding: 10px;
            }
            
            .header {
                flex-direction: column;
                text-align: center;
            }
            
            .stats {
                justify-content: center;
            }
            
            .file-entry {
                flex-direction: column;
                align-items: stretch;
                gap: 1rem;
            }
            
            .file-actions {
                display: flex;
                justify-content: flex-end;
            }
        }
        """
