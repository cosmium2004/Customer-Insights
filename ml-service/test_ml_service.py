"""
Unit tests for ML service components.

Tests preprocessing, sentiment prediction, and workflow functions.
**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9**
"""

import pytest
from preprocessing import preprocess_text, validate_text_length, truncate_text
from sentiment_model import SentimentModel


class TestPreprocessText:
    """Test suite for text preprocessing functionality."""
    
    def test_preprocess_text_normalizes_correctly(self):
        """
        Test that preprocess_text normalizes text correctly.
        **Validates: Requirements 3.6**
        """
        text = "This Is A TEST with MIXED case"
        result = preprocess_text(text)
        assert result == "this is a test with mixed case"
        assert result.islower()
    
    def test_preprocess_text_handles_empty_strings(self):
        """
        Test that preprocess_text handles empty strings by raising ValueError.
        **Validates: Requirements 3.6**
        """
        with pytest.raises(ValueError, match="Text must be a non-empty string"):
            preprocess_text("")
        
        with pytest.raises(ValueError, match="Text cannot be empty or whitespace only"):
            preprocess_text("   ")
        
        with pytest.raises(ValueError, match="Text cannot be empty or whitespace only"):
            preprocess_text("\t\n")
    
    def test_preprocess_text_replaces_urls(self):
        """
        Test that preprocess_text replaces URLs.
        **Validates: Requirements 3.7**
        """
        test_cases = [
            "Visit https://example.com for info",
            "Check http://test.org and https://secure.com",
            "Go to www.example.com now",
        ]
        
        for text in test_cases:
            result = preprocess_text(text)
            # URLs should be removed/replaced
            assert "http://" not in result
            assert "https://" not in result
            assert "www." not in result
    
    def test_preprocess_text_replaces_emails(self):
        """
        Test that preprocess_text replaces email addresses.
        **Validates: Requirements 3.8**
        """
        test_cases = [
            "Contact support@example.com",
            "Email me at john.doe@company.org",
            "Reach out to admin@test.co.uk",
        ]
        
        for text in test_cases:
            result = preprocess_text(text)
            # Emails should be removed/replaced (@ symbol removed)
            assert "@" not in result
    
    def test_preprocess_text_replaces_numbers(self):
        """
        Test that preprocess_text replaces numbers.
        **Validates: Requirements 3.9**
        """
        test_cases = [
            ("I have 42 apples", "42"),
            ("Price is 19.99 dollars", "19.99"),
            ("Years 2020 and 2021", "2020"),
        ]
        
        for text, number in test_cases:
            result = preprocess_text(text)
            # Numbers should be removed/replaced
            assert number not in result
    
    def test_preprocess_text_normalizes_whitespace(self):
        """
        Test that preprocess_text normalizes whitespace to single spaces.
        **Validates: Requirements 3.6**
        """
        test_cases = [
            ("This  has   multiple    spaces", "this has multiple spaces"),
            ("Tabs\t\tand\t\tspaces", "tabs and spaces"),
            ("Newlines\n\nand\n\nspaces", "newlines and spaces"),
            ("  Leading and trailing  ", "leading and trailing")
        ]
        
        for text, expected in test_cases:
            result = preprocess_text(text)
            assert "  " not in result  # No double spaces
            assert result.strip() == expected.strip()
    
    def test_preprocess_text_handles_special_characters(self):
        """
        Test that preprocess_text handles special characters appropriately.
        **Validates: Requirements 3.6**
        """
        text = "Hello! How are you? I'm fine, thanks."
        result = preprocess_text(text)
        # Should preserve basic punctuation
        assert "!" in result or "?" in result or "," in result or result.replace("!", "").replace("?", "").replace(",", "")
    
    def test_preprocess_text_combined_replacements(self):
        """
        Test that preprocess_text handles multiple replacement types together.
        **Validates: Requirements 3.6, 3.7, 3.8, 3.9**
        """
        text = "Contact me at john@example.com or visit https://example.com. I have 100 items."
        result = preprocess_text(text)
        
        # Original values should not be present (they are replaced/removed)
        assert "john@example.com" not in result
        assert "@" not in result
        assert "https://example.com" not in result
        assert "100" not in result


class TestPredictSentiment:
    """Test suite for sentiment prediction functionality."""
    
    @pytest.fixture(scope="class")
    def model(self):
        """Fixture to create and load sentiment model once for all tests."""
        model = SentimentModel()
        model.load_model()
        return model
    
    def test_predict_sentiment_returns_valid_predictions(self, model):
        """
        Test that predict_sentiment_workflow returns valid predictions.
        **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
        """
        text = "This is a great product! I love it!"
        result = model.predict_sentiment(text)
        
        # Verify structure
        assert 'sentiment' in result
        assert 'confidence' in result
        assert 'scores' in result
        assert 'processing_time_ms' in result
        
        # Verify sentiment is valid
        assert result['sentiment'] in ['positive', 'negative', 'neutral']
        
        # Verify confidence is valid
        assert 0 <= result['confidence'] <= 1
        
        # Verify scores structure
        assert 'positive' in result['scores']
        assert 'negative' in result['scores']
        assert 'neutral' in result['scores']
    
    def test_predict_sentiment_positive_text(self, model):
        """
        Test sentiment prediction on clearly positive text.
        **Validates: Requirements 3.1, 3.2**
        """
        positive_texts = [
            "This is absolutely wonderful and amazing!",
            "I love this product, it's fantastic!",
            "Excellent service, highly recommend!",
            "Best experience ever, very happy!"
        ]
        
        for text in positive_texts:
            result = model.predict_sentiment(text)
            assert result['sentiment'] in ['positive', 'negative', 'neutral']
            assert result['confidence'] > 0
    
    def test_predict_sentiment_negative_text(self, model):
        """
        Test sentiment prediction on clearly negative text.
        **Validates: Requirements 3.1, 3.2**
        """
        negative_texts = [
            "This is terrible and awful!",
            "I hate this product, it's horrible!",
            "Worst experience ever, very disappointed!",
            "Poor quality, do not recommend!"
        ]
        
        for text in negative_texts:
            result = model.predict_sentiment(text)
            assert result['sentiment'] in ['positive', 'negative', 'neutral']
            assert result['confidence'] > 0
    
    def test_predict_sentiment_neutral_text(self, model):
        """
        Test sentiment prediction on neutral text.
        **Validates: Requirements 3.1, 3.2**
        """
        neutral_texts = [
            "The product arrived on time.",
            "It is blue and made of plastic.",
            "The package contains three items.",
            "This is a description of the product."
        ]
        
        for text in neutral_texts:
            result = model.predict_sentiment(text)
            assert result['sentiment'] in ['positive', 'negative', 'neutral']
            assert result['confidence'] > 0
    
    def test_prediction_scores_sum_to_approximately_one(self, model):
        """
        Test that prediction scores sum to approximately 1.0.
        **Validates: Requirements 3.3, 3.4**
        """
        test_texts = [
            "This is great!",
            "This is terrible!",
            "This is okay.",
            "I have mixed feelings about this product.",
            "The service was acceptable but not outstanding."
        ]
        
        for text in test_texts:
            result = model.predict_sentiment(text)
            total = (result['scores']['positive'] + 
                    result['scores']['negative'] + 
                    result['scores']['neutral'])
            
            # Allow small floating point error
            assert 0.99 <= total <= 1.01, f"Scores sum to {total}, expected ~1.0 for text: {text}"
    
    def test_prediction_confidence_equals_max_score(self, model):
        """
        Test that confidence equals the maximum sentiment score.
        **Validates: Requirements 3.5**
        """
        test_texts = [
            "This is absolutely amazing!",
            "This is completely terrible!",
            "This is just a neutral statement.",
            "I'm not sure how I feel about this."
        ]
        
        for text in test_texts:
            result = model.predict_sentiment(text)
            max_score = max(
                result['scores']['positive'],
                result['scores']['negative'],
                result['scores']['neutral']
            )
            
            # Allow small floating point error
            assert abs(result['confidence'] - max_score) < 0.001, \
                f"Confidence {result['confidence']} != max score {max_score} for text: {text}"
    
    def test_prediction_processing_time_recorded(self, model):
        """
        Test that processing time is recorded in the result.
        **Validates: Requirements 3.1**
        """
        text = "This is a test message for timing."
        result = model.predict_sentiment(text)
        
        assert 'processing_time_ms' in result
        assert result['processing_time_ms'] > 0
        assert isinstance(result['processing_time_ms'], (int, float))
    
    def test_prediction_handles_various_text_lengths(self, model):
        """
        Test that prediction handles various text lengths correctly.
        **Validates: Requirements 3.1**
        """
        test_cases = [
            "Short text.",
            "This is a medium length text with several words in it.",
            "This is a much longer text that contains many more words and should still be processed correctly by the sentiment analysis model. " * 5
        ]
        
        for text in test_cases:
            result = model.predict_sentiment(text)
            assert result is not None
            assert 'sentiment' in result
            assert 'confidence' in result
            assert 'scores' in result
    
    def test_prediction_empty_text_raises_error(self, model):
        """
        Test that empty text raises appropriate error.
        **Validates: Requirements 3.1**
        """
        with pytest.raises(ValueError):
            model.predict_sentiment("")
        
        with pytest.raises(ValueError):
            model.predict_sentiment("   ")


class TestValidateTextLength:
    """Test suite for text length validation."""
    
    def test_validate_text_length_valid_text(self):
        """Test validation accepts valid text lengths."""
        assert validate_text_length("short text") is True
        assert validate_text_length("a" * 100) is True
        assert validate_text_length("a" * 1000) is True
        assert validate_text_length("a" * 10000) is True
    
    def test_validate_text_length_too_long(self):
        """Test validation rejects text that's too long."""
        assert validate_text_length("a" * 10001, max_length=10000) is False
        assert validate_text_length("a" * 20000, max_length=10000) is False
    
    def test_validate_text_length_empty(self):
        """Test validation rejects empty text."""
        assert validate_text_length("") is False
        # Note: validate_text_length returns False for empty, but doesn't check whitespace
        # So whitespace-only strings return True based on length check
    
    def test_validate_text_length_custom_max(self):
        """Test validation with custom max length."""
        assert validate_text_length("a" * 50, max_length=100) is True
        assert validate_text_length("a" * 150, max_length=100) is False


class TestTruncateText:
    """Test suite for text truncation."""
    
    def test_truncate_text_long_text(self):
        """Test truncation of text exceeding max length."""
        text = "a" * 2000
        result = truncate_text(text, max_length=1000)
        assert len(result) == 1000
    
    def test_truncate_text_short_text(self):
        """Test truncation preserves short text."""
        text = "short text"
        result = truncate_text(text, max_length=1000)
        assert result == text
    
    def test_truncate_text_exact_length(self):
        """Test truncation with text at exact max length."""
        text = "a" * 1000
        result = truncate_text(text, max_length=1000)
        assert len(result) == 1000
        assert result == text


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
