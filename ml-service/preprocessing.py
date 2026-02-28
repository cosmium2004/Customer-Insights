"""
Text preprocessing module for sentiment analysis.

This module provides functions to preprocess text data before feeding it to ML models.
Preprocessing includes normalization, tokenization, and replacement of special patterns.
"""

import re
from typing import Optional


def preprocess_text(text: str) -> str:
    """
    Preprocess text for sentiment analysis.
    
    Preprocessing steps:
    1. Convert to lowercase
    2. Replace URLs with [URL] token
    3. Replace email addresses with [EMAIL] token
    4. Replace numbers with [NUM] token
    5. Remove special characters except punctuation
    6. Normalize whitespace to single spaces
    
    Args:
        text: Input text to preprocess
        
    Returns:
        Preprocessed text ready for model input
        
    Raises:
        ValueError: If text is empty or None
    """
    if not text or not isinstance(text, str):
        raise ValueError("Text must be a non-empty string")
    
    if not text.strip():
        raise ValueError("Text cannot be empty or whitespace only")
    
    # Step 1: Convert to lowercase
    processed = text.lower()
    
    # Step 2: Replace URLs with [URL] token
    # Match http://, https://, www., and common TLDs
    url_pattern = r'(?:http[s]?://|www\.)[^\s]+'
    processed = re.sub(url_pattern, '[URL]', processed)
    
    # Step 3: Replace email addresses with [EMAIL] token
    # Match standard email format
    email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
    processed = re.sub(email_pattern, '[EMAIL]', processed, flags=re.IGNORECASE)
    
    # Step 4: Replace numbers with [NUM] token
    # Match integers and decimals
    number_pattern = r'\b\d+(?:\.\d+)?\b'
    processed = re.sub(number_pattern, '[NUM]', processed)
    
    # Step 5: Remove special characters except punctuation
    # Keep letters, numbers, spaces, and common punctuation (.,!?;:'-")
    # Remove other special characters
    special_chars_pattern = r'[^a-z0-9\s.,!?;:\'\"\-\[\]]'
    processed = re.sub(special_chars_pattern, '', processed)
    
    # Step 6: Normalize whitespace to single spaces
    # Replace multiple spaces, tabs, newlines with single space
    processed = re.sub(r'\s+', ' ', processed)
    
    # Trim leading and trailing whitespace
    processed = processed.strip()
    
    # Final validation
    if not processed:
        raise ValueError("Preprocessed text is empty")
    
    return processed


def validate_text_length(text: str, max_length: int = 10000) -> bool:
    """
    Validate that text length is within acceptable limits.
    
    Args:
        text: Text to validate
        max_length: Maximum allowed length (default: 10000 characters)
        
    Returns:
        True if text length is valid, False otherwise
    """
    if not text:
        return False
    return len(text) <= max_length


def truncate_text(text: str, max_length: int = 1000) -> str:
    """
    Truncate text to maximum length if needed.
    
    Args:
        text: Text to truncate
        max_length: Maximum length (default: 1000 characters)
        
    Returns:
        Truncated text
    """
    if not text:
        return ""
    
    if len(text) <= max_length:
        return text
    
    return text[:max_length]
