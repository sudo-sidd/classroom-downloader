import os
import logging
import asyncio
import aiofiles
import sqlite3
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
import json
import tempfile

try:
    import google.generativeai as genai
    from PyPDF2 import PdfReader
    from docx import Document
    HAS_AI_DEPS = True
except ImportError:
    HAS_AI_DEPS = False

from dotenv import load_dotenv

# Load environment variables
load_dotenv()


class LLMDocumentAnalyzer:
    """AI-powered document analyzer using Google Gemini for intelligent subject classification."""
    
    def __init__(self, db_manager):
        """Initialize the analyzer with database manager."""
        self.db_manager = db_manager
        self.logger = logging.getLogger(__name__)
        self.model = None
        self.initialized = False
        
        # Check if AI dependencies are available
        if not HAS_AI_DEPS:
            self.logger.error("AI dependencies not installed. Run: pip install google-generativeai PyPDF2 python-docx")
            return
        
        # Initialize Gemini
        api_key = os.getenv('GEMINI_API_KEY')
        if not api_key:
            self.logger.error("GEMINI_API_KEY not found in environment variables")
            return
        
        if not api_key.strip():
            self.logger.error("GEMINI_API_KEY is empty")
            return
            
        self.logger.info(f"Initializing Gemini with API key: {api_key[:10]}...")
        
        try:
            genai.configure(api_key=api_key)
            
            # Try different model names based on what's available
            models_to_try = [
                'gemini-2.0-flash',        # Latest stable model
                'gemini-2.5-flash',        # Alternative stable model  
                'gemini-flash-latest',     # Latest flash model
                'gemini-pro-latest',       # Latest pro model
                'gemini-2.5-pro',          # Stable pro model
                'gemini-2.0-flash-exp',    # Experimental fallback
            ]
            
            for model_name in models_to_try:
                try:
                    self.logger.info(f"Trying model: {model_name}")
                    self.model = genai.GenerativeModel(model_name)
                    
                    # Test the API connection with a simple request
                    test_response = self.model.generate_content("Hello")
                    self.logger.info(f"Test response: {test_response.text[:50]}")
                    
                    self.initialized = True
                    self.logger.info(f"LLM Document Analyzer initialized successfully with model: {model_name}")
                    break
                except Exception as e:
                    self.logger.warning(f"Model {model_name} failed: {e}")
                    continue
            
            if not self.initialized:
                self.logger.error("All model initialization attempts failed")
                
        except Exception as e:
            self.logger.error(f"Failed to configure Gemini API: {e}")
            import traceback
            self.logger.error(traceback.format_exc())
    
    def is_available(self) -> bool:
        """Check if the analyzer is properly initialized and ready to use."""
        return HAS_AI_DEPS and self.initialized and self.model is not None
    
    async def extract_text_from_file(self, file_path: str, max_pages: int = 3) -> str:
        """
        Extract text content from various file formats.
        
        Args:
            file_path: Path to the file
            max_pages: Maximum number of pages to extract (for PDFs)
            
        Returns:
            Extracted text content
        """
        try:
            file_path = Path(file_path)
            if not file_path.exists():
                return ""
            
            extension = file_path.suffix.lower()
            
            if extension == '.pdf':
                return await self._extract_pdf_text(file_path, max_pages)
            elif extension in ['.docx', '.doc']:
                return await self._extract_docx_text(file_path)
            elif extension in ['.txt', '.md']:
                return await self._extract_text_file(file_path)
            else:
                self.logger.warning(f"Unsupported file type: {extension}")
                return ""
                
        except Exception as e:
            self.logger.error(f"Error extracting text from {file_path}: {e}")
            return ""
    
    async def _extract_pdf_text(self, file_path: Path, max_pages: int) -> str:
        """Extract text from PDF file."""
        try:
            with open(file_path, 'rb') as file:
                reader = PdfReader(file)
                text = ""
                
                # Extract text from first few pages
                pages_to_read = min(len(reader.pages), max_pages)
                for i in range(pages_to_read):
                    page = reader.pages[i]
                    text += page.extract_text() + "\n"
                
                return text.strip()
        except Exception as e:
            self.logger.error(f"Error reading PDF {file_path}: {e}")
            return ""
    
    async def _extract_docx_text(self, file_path: Path) -> str:
        """Extract text from DOCX file."""
        try:
            doc = Document(file_path)
            text = ""
            
            # Extract paragraphs (limit to avoid too much text)
            for i, paragraph in enumerate(doc.paragraphs[:20]):  # First 20 paragraphs
                text += paragraph.text + "\n"
            
            return text.strip()
        except Exception as e:
            self.logger.error(f"Error reading DOCX {file_path}: {e}")
            return ""
    
    async def _extract_text_file(self, file_path: Path) -> str:
        """Extract text from plain text file."""
        try:
            async with aiofiles.open(file_path, 'r', encoding='utf-8', errors='ignore') as file:
                content = await file.read()
                # Limit text length
                return content[:5000]  # First 5000 characters
        except Exception as e:
            self.logger.error(f"Error reading text file {file_path}: {e}")
            return ""
    
    async def analyze_document_content(self, material: Dict[str, Any]) -> Dict[str, Any]:
        """
        Analyze document content and announcement to determine subject and create summary.
        
        Args:
            material: Material dictionary with file information
            
        Returns:
            Analysis results with subject suggestions and content summary
        """
        if not self.is_available():
            return {'error': 'LLM analyzer not available'}
        
        try:
            # Extract file content
            file_content = ""
            if material.get('local_path'):
                file_content = await self.extract_text_from_file(material['local_path'])
            
            # Prepare analysis prompt
            analysis_data = {
                'title': material.get('title', ''),
                'description': material.get('description', ''),
                'announcement_text': material.get('announcement_text', ''),
                'file_content': file_content[:3000] if file_content else '',  # Limit content
                'mime_type': material.get('mime_type', '')
            }
            
            # Generate analysis
            analysis = await self._analyze_with_gemini(analysis_data)
            return analysis
            
        except Exception as e:
            self.logger.error(f"Error analyzing document {material.get('title')}: {e}")
            return {'error': str(e)}
    
    async def _analyze_with_gemini(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Use Gemini to analyze document content and suggest classification."""
        
        prompt = f"""
Analyze this educational document and provide intelligent subject classification:

Document Title: {data['title']}
Description: {data['description']}
Announcement Text: {data['announcement_text']}
File Type: {data['mime_type']}

Document Content (first few pages):
{data['file_content']}

Based on this information, please provide:

1. **Primary Subject**: What academic subject does this document belong to? (e.g., Computer Science, Mathematics, Physics, Software Engineering, Data Science, etc.)

2. **Confidence Score**: Rate your confidence from 0.0 to 1.0

3. **Subject Keywords**: List relevant keywords/terms that identify this subject (comma-separated)

4. **Content Summary**: Brief 2-3 sentence summary of what this document covers

5. **Alternative Subjects**: If this could belong to multiple subjects, list up to 2 alternatives with confidence scores

6. **Document Type**: What type of document is this? (lecture notes, assignment, slides, textbook chapter, lab manual, etc.)

Please respond in this exact JSON format:
{{
    "primary_subject": "Subject Name",
    "confidence": 0.85,
    "keywords": ["keyword1", "keyword2", "keyword3"],
    "content_summary": "Brief summary of document content",
    "alternative_subjects": [
        {{"subject": "Alternative Subject 1", "confidence": 0.65}},
        {{"subject": "Alternative Subject 2", "confidence": 0.45}}
    ],
    "document_type": "Document Type",
    "reasoning": "Brief explanation of why this classification was chosen"
}}
"""
        
        try:
            response = await asyncio.to_thread(
                self.model.generate_content,
                prompt,
                generation_config=genai.types.GenerationConfig(
                    temperature=0.1,  # Low temperature for more consistent results
                    top_p=0.8,
                    top_k=40,
                    max_output_tokens=1024,
                )
            )
            
            # Parse JSON response
            response_text = response.text.strip()
            
            # Remove markdown code block markers if present
            if response_text.startswith('```json'):
                response_text = response_text[7:]
            if response_text.endswith('```'):
                response_text = response_text[:-3]
            
            result = json.loads(response_text)
            
            # Validate and clean up the response
            return self._validate_analysis_result(result)
            
        except json.JSONDecodeError as e:
            self.logger.error(f"Failed to parse JSON response: {e}")
            return {'error': 'Invalid response format from AI'}
        except Exception as e:
            self.logger.error(f"Error calling Gemini API: {e}")
            return {'error': str(e)}
    
    def _validate_analysis_result(self, result: Dict[str, Any]) -> Dict[str, Any]:
        """Validate and clean up analysis result."""
        validated = {
            'primary_subject': result.get('primary_subject', 'Unknown'),
            'confidence': max(0.0, min(1.0, float(result.get('confidence', 0.5)))),
            'keywords': result.get('keywords', [])[:10],  # Limit keywords
            'content_summary': result.get('content_summary', '')[:500],  # Limit summary
            'alternative_subjects': result.get('alternative_subjects', [])[:3],  # Limit alternatives
            'document_type': result.get('document_type', 'Unknown'),
            'reasoning': result.get('reasoning', '')[:300]  # Limit reasoning
        }
        
        # Ensure keywords is a list
        if isinstance(validated['keywords'], str):
            validated['keywords'] = [k.strip() for k in validated['keywords'].split(',') if k.strip()]
        
        return validated
    
    async def analyze_and_classify_files(self, materials: List[Dict[str, Any]], 
                                       auto_create_subjects: bool = True,
                                       confidence_threshold: float = 0.7) -> Dict[str, Any]:
        """
        Analyze multiple files and automatically classify them, creating new subjects as needed.
        
        Args:
            materials: List of material dictionaries to analyze
            auto_create_subjects: Whether to automatically create new subjects
            confidence_threshold: Minimum confidence to auto-apply classification
            
        Returns:
            Classification results and statistics
        """
        if not self.is_available():
            return {'error': 'LLM analyzer not available'}
        
        results = {
            'total_analyzed': 0,
            'successfully_classified': 0,
            'new_subjects_created': 0,
            'low_confidence_files': [],
            'errors': [],
            'subject_suggestions': {}
        }
        
        # Get existing subjects
        existing_subjects = {s['name'].lower(): s for s in self.db_manager.get_all_subjects()}
        
        for material in materials:
            try:
                results['total_analyzed'] += 1
                
                # Analyze the document
                analysis = await self.analyze_document_content(material)
                
                if 'error' in analysis:
                    results['errors'].append({
                        'material_id': material['id'],
                        'title': material['title'],
                        'error': analysis['error']
                    })
                    continue
                
                # Store analysis results in database
                await self._store_analysis_results(material['id'], analysis)
                
                # Get or create subject
                primary_subject = analysis['primary_subject']
                confidence = analysis['confidence']
                
                subject_id = None
                
                # Check if subject already exists
                subject_key = primary_subject.lower()
                if subject_key in existing_subjects:
                    subject_id = existing_subjects[subject_key]['id']
                elif auto_create_subjects and confidence >= confidence_threshold:
                    # Create new subject
                    keywords = ', '.join(analysis['keywords'][:5])  # Use top 5 keywords
                    if self.db_manager.add_subject(primary_subject, keywords, priority=7):
                        results['new_subjects_created'] += 1
                        # Refresh existing subjects
                        new_subjects = self.db_manager.get_all_subjects()
                        existing_subjects = {s['name'].lower(): s for s in new_subjects}
                        subject_id = existing_subjects[subject_key]['id']
                
                # Classify the file if we have a subject and sufficient confidence
                if subject_id and confidence >= confidence_threshold:
                    if self.db_manager.classify_file(material['id'], subject_id, 'auto'):
                        results['successfully_classified'] += 1
                else:
                    # Store for manual review
                    results['low_confidence_files'].append({
                        'material_id': material['id'],
                        'title': material['title'],
                        'suggested_subject': primary_subject,
                        'confidence': confidence,
                        'keywords': analysis['keywords'],
                        'alternatives': analysis['alternative_subjects']
                    })
                
                # Store subject suggestions for UI
                results['subject_suggestions'][material['id']] = {
                    'primary': {
                        'subject': primary_subject,
                        'confidence': confidence
                    },
                    'alternatives': analysis['alternative_subjects']
                }
                
            except Exception as e:
                self.logger.error(f"Error processing material {material.get('id')}: {e}")
                results['errors'].append({
                    'material_id': material.get('id'),
                    'title': material.get('title', 'Unknown'),
                    'error': str(e)
                })
        
        return results
    
    async def _store_analysis_results(self, material_id: int, analysis: Dict[str, Any]):
        """Store analysis results in the database."""
        try:
            with sqlite3.connect(self.db_manager.db_path) as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    UPDATE materials 
                    SET content_summary = ?, extracted_content = ?
                    WHERE id = ?
                """, (
                    analysis.get('content_summary', ''),
                    json.dumps(analysis),  # Store full analysis as JSON
                    material_id
                ))
                conn.commit()
        except Exception as e:
            self.logger.error(f"Error storing analysis results for material {material_id}: {e}")
    
    async def get_subject_suggestions_for_file(self, material_id: int) -> Dict[str, Any]:
        """Get AI-powered subject suggestions for a specific file."""
        try:
            # Get material from database
            materials = self.db_manager.get_all_materials()
            material = next((m for m in materials if m['id'] == material_id), None)
            
            if not material:
                return {'error': 'Material not found'}
            
            # Analyze the document
            analysis = await self.analyze_document_content(material)
            
            if 'error' in analysis:
                return analysis
            
            # Get existing subjects for matching
            existing_subjects = self.db_manager.get_all_subjects()
            
            suggestions = []
            
            # Add primary suggestion
            suggestions.append({
                'subject_name': analysis['primary_subject'],
                'confidence': analysis['confidence'],
                'keywords': analysis['keywords'],
                'is_new_subject': not any(s['name'].lower() == analysis['primary_subject'].lower() 
                                        for s in existing_subjects),
                'reasoning': analysis.get('reasoning', '')
            })
            
            # Add alternatives
            for alt in analysis.get('alternative_subjects', []):
                suggestions.append({
                    'subject_name': alt['subject'],
                    'confidence': alt['confidence'],
                    'keywords': [],
                    'is_new_subject': not any(s['name'].lower() == alt['subject'].lower() 
                                            for s in existing_subjects),
                    'reasoning': f"Alternative suggestion based on content analysis"
                })
            
            return {
                'suggestions': suggestions,
                'content_summary': analysis.get('content_summary', ''),
                'document_type': analysis.get('document_type', 'Unknown')
            }
            
        except Exception as e:
            self.logger.error(f"Error getting suggestions for material {material_id}: {e}")
            return {'error': str(e)}
