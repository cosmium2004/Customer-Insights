"""
Basic tests to verify ML service functionality.
"""

import pytest
from preprocessing import preprocess_text, validate_text_length, truncate_text


def test_preprocess_text_lowercase():
    """Test that text is converted to lowercase"""
    text = "This Is A TEST"
    result = preprocess_text(text)
    assert result == "this is a test"


def test_preprocess_text_url_replacement():
    """Test that URLs are replaced with [URL] token"""
    text = "Check out https://example.com for more info"
    result = preprocess_text(text)
    assert "[URL]" in result
    assert "https://example.com" not in result


def test_preprocess_text_email_replacement():
    """Test that email addresses are replaced with [EMAIL] token"""
    text = "Contact us at support@example.com"
    result = preprocess_text(text)
    assert "[EMAIL]" in result
    assert "support@example.com" not in result


def test_preprocess_text_number_replacement():
    """Test that numbers are replaced with [NUM] token"""
    text = "I have 42 apples and 3.14 oranges"
    result = preprocess_text(text)
    assert "[NUM]" in result
    assert "42" not in result
    assert "3.14" not in result


def test_preprocess_text_whitespace_normalization():
    """Test that whitespace is normalized to single spaces"""
    text = "This  has   multiple    spaces"
    result = preprocess_text(text)
    assert "  " not in result
    assert result == "this has multiple spaces"


def test_preprocess_text_empty_raises_error():
    """Test that empty text raises ValueError"""
    with pytest.raises(ValueError):
        preprocess_text("")
    
    with pytest.raises(ValueError):
        preprocess_text("   ")


def test_validate_text_length():
    """Test text length validation"""
    assert validate_text_length("short text") is True
    assert validate_text_length("a" * 10000) is True
    assert validate_text_length("a" * 10001, max_length=10000) is False
    assert validate_text_length("") is False


def test_truncate_text():
    """Test text truncation"""
    text = "a" * 2000
    result = truncate_text(text, max_length=1000)
    assert len(result) == 1000
    
    short_text = "short"
    result = truncate_text(short_text, max_length=1000)
    assert result == short_text


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
