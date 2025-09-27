import logging
import re
from typing import List, Dict, Any, Optional, Tuple


class SubjectClassifier:
    """Handles automatic classification of files to subjects based on keywords."""
    
    def __init__(self, db_manager):
        """Initialize the classifier with database manager."""
        self.db_manager = db_manager
        self.logger = logging.getLogger(__name__)
    
    def classify_file(self, material: Dict[str, Any]) -> Optional[Tuple[int, float]]:
        """
        Classify a file based on its title and description.
        
        Args:
            material: Dictionary containing file information with 'title' and 'description'
        
        Returns:
            Tuple of (subject_id, confidence_score) or None if no match found
        """
        try:
            # Get all subjects
            subjects = self.db_manager.get_all_subjects()
            if not subjects:
                return None
            
            # Extract text to analyze
            text_to_analyze = self._extract_text_for_analysis(material)
            if not text_to_analyze:
                return None
            
            # Find best matching subject
            best_match = self._find_best_match(text_to_analyze, subjects)
            return best_match
            
        except Exception as e:
            self.logger.error(f"Error classifying file {material.get('title', 'unknown')}: {e}")
            return None
    
    def _extract_text_for_analysis(self, material: Dict[str, Any]) -> str:
        """Extract and normalize text from material for analysis."""
        text_parts = []
        
        # Add title
        if material.get('title'):
            text_parts.append(material['title'])
        
        # Add description
        if material.get('description'):
            text_parts.append(material['description'])
        
        # Combine and normalize
        combined_text = ' '.join(text_parts).lower()
        
        # Remove extra whitespace and special characters
        combined_text = re.sub(r'[^\w\s]', ' ', combined_text)
        combined_text = re.sub(r'\s+', ' ', combined_text).strip()
        
        return combined_text
    
    def _find_best_match(self, text: str, subjects: List[Dict[str, Any]]) -> Optional[Tuple[int, float]]:
        """
        Find the best matching subject based on keyword matching.
        
        Args:
            text: Normalized text to analyze
            subjects: List of subject dictionaries
        
        Returns:
            Tuple of (subject_id, confidence_score) or None
        """
        matches = []
        
        for subject in subjects:
            score = self._calculate_match_score(text, subject)
            if score > 0:
                matches.append((subject['id'], score, subject['priority']))
        
        if not matches:
            return None
        
        # Sort by score first, then by priority
        matches.sort(key=lambda x: (x[1], x[2]), reverse=True)
        
        # Return the best match (subject_id, confidence_score)
        return (matches[0][0], matches[0][1])
    
    def _calculate_match_score(self, text: str, subject: Dict[str, Any]) -> float:
        """
        Calculate match score between text and subject keywords.
        
        Args:
            text: Normalized text to analyze
            subject: Subject dictionary with keywords
        
        Returns:
            Float score (0.0 to 1.0)
        """
        keywords = subject.get('keywords', '').lower()
        if not keywords:
            return 0.0
        
        # Split keywords by comma and normalize
        keyword_list = [k.strip() for k in keywords.split(',') if k.strip()]
        if not keyword_list:
            return 0.0
        
        matched_keywords = 0
        total_weight = 0
        
        for keyword in keyword_list:
            # Simple exact word matching
            if self._keyword_matches_text(keyword, text):
                matched_keywords += 1
                # Longer keywords get higher weight
                total_weight += len(keyword.split())
        
        if matched_keywords == 0:
            return 0.0
        
        # Calculate score: (matched_keywords / total_keywords) * weight_factor
        base_score = matched_keywords / len(keyword_list)
        weight_factor = min(1.0 + (total_weight * 0.1), 2.0)  # Cap at 2.0
        
        return min(base_score * weight_factor, 1.0)
    
    def _keyword_matches_text(self, keyword: str, text: str) -> bool:
        """
        Check if a keyword matches the text.
        Supports both exact word matching and partial matching for abbreviations.
        """
        keyword = keyword.strip().lower()
        if not keyword:
            return False
        
        # For single words or abbreviations (length <= 5), use word boundary matching
        if len(keyword) <= 5 or len(keyword.split()) == 1:
            pattern = r'\b' + re.escape(keyword) + r'\b'
            return bool(re.search(pattern, text, re.IGNORECASE))
        
        # For longer phrases, use exact matching
        return keyword in text
    
    def classify_multiple_files(self, materials: List[Dict[str, Any]], 
                              auto_apply: bool = False) -> List[Dict[str, Any]]:
        """
        Classify multiple files and optionally auto-apply classifications.
        
        Args:
            materials: List of material dictionaries
            auto_apply: Whether to automatically apply classifications to database
        
        Returns:
            List of classification results
        """
        results = []
        
        for material in materials:
            result = {
                'material_id': material.get('id'),
                'title': material.get('title'),
                'classification': None,
                'confidence': 0.0,
                'applied': False
            }
            
            classification = self.classify_file(material)
            if classification:
                subject_id, confidence = classification
                result['classification'] = subject_id
                result['confidence'] = confidence
                
                # Auto-apply if requested and confidence is high enough
                if auto_apply and confidence >= 0.7:  # 70% confidence threshold
                    if self.db_manager.classify_file(material['id'], subject_id, 'auto'):
                        result['applied'] = True
                        self.logger.info(f"Auto-classified '{material.get('title')}' to subject {subject_id}")
            
            results.append(result)
        
        return results
    
    def get_classification_suggestions(self, material: Dict[str, Any], 
                                     limit: int = 3) -> List[Dict[str, Any]]:
        """
        Get multiple classification suggestions for a file.
        
        Args:
            material: Material dictionary
            limit: Maximum number of suggestions to return
        
        Returns:
            List of suggestion dictionaries with subject info and confidence scores
        """
        try:
            subjects = self.db_manager.get_all_subjects()
            if not subjects:
                return []
            
            text_to_analyze = self._extract_text_for_analysis(material)
            if not text_to_analyze:
                return []
            
            # Calculate scores for all subjects
            suggestions = []
            for subject in subjects:
                score = self._calculate_match_score(text_to_analyze, subject)
                if score > 0:
                    suggestions.append({
                        'subject_id': subject['id'],
                        'subject_name': subject['name'],
                        'subject_color': subject['color'],
                        'confidence': score,
                        'keywords': subject['keywords']
                    })
            
            # Sort by confidence and return top suggestions
            suggestions.sort(key=lambda x: x['confidence'], reverse=True)
            return suggestions[:limit]
            
        except Exception as e:
            self.logger.error(f"Error getting suggestions for {material.get('title', 'unknown')}: {e}")
            return []
    
    def reclassify_all_files(self, confidence_threshold: float = 0.7) -> Dict[str, int]:
        """
        Reclassify all files in the database based on current subjects.
        
        Args:
            confidence_threshold: Minimum confidence to auto-apply classification
        
        Returns:
            Dictionary with statistics about the reclassification
        """
        try:
            # Get all materials
            all_materials = self.db_manager.get_all_materials()
            
            stats = {
                'total_files': len(all_materials),
                'classified': 0,
                'auto_applied': 0,
                'low_confidence': 0
            }
            
            for material in all_materials:
                classification = self.classify_file(material)
                if classification:
                    subject_id, confidence = classification
                    stats['classified'] += 1
                    
                    if confidence >= confidence_threshold:
                        # Remove existing classification and apply new one
                        self.db_manager.unclassify_file(material['id'])
                        if self.db_manager.classify_file(material['id'], subject_id, 'auto'):
                            stats['auto_applied'] += 1
                    else:
                        stats['low_confidence'] += 1
            
            self.logger.info(f"Reclassification complete: {stats}")
            return stats
            
        except Exception as e:
            self.logger.error(f"Error during reclassification: {e}")
            return {'error': str(e)}
