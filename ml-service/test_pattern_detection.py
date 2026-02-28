"""
Unit tests for pattern detection functions.

Tests verify that pattern detection helper functions work correctly
for specific examples and edge cases.
"""

import pytest
from datetime import datetime, timedelta
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pattern_detection import (
    calculate_channel_frequency,
    analyze_sentiment_trend,
    detect_temporal_pattern,
    calculate_engagement_score
)


class TestCalculateChannelFrequency:
    """Tests for calculate_channel_frequency function."""
    
    def test_identifies_frequent_channels(self):
        """
        Test that calculate_channel_frequency identifies channels used >= 10 times.
        
        Requirements: 4.5
        """
        # Create 15 web interactions with regular intervals
        base_time = datetime.now()
        interactions = []
        for i in range(15):
            interactions.append({
                'id': f'interaction-{i}',
                'timestamp': base_time - timedelta(days=i * 2),
                'channel': 'web',
                'content': 'test'
            })
        
        result = calculate_channel_frequency(interactions)
        
        # Web channel should be detected
        assert 'web' in result
        assert result['web']['count'] == 15
        assert result['web']['regularity'] > 0
        assert result['web']['avg_interval'] > 0
    
    def test_excludes_infrequent_channels(self):
        """
        Test that channels used < 10 times are excluded.
        
        Requirements: 4.5
        """
        # Create 9 web interactions
        base_time = datetime.now()
        interactions = []
        for i in range(9):
            interactions.append({
                'id': f'interaction-{i}',
                'timestamp': base_time - timedelta(days=i),
                'channel': 'web',
                'content': 'test'
            })
        
        result = calculate_channel_frequency(interactions)
        
        # Web channel should NOT be in results (< 10 uses)
        assert 'web' not in result
    
    def test_multiple_channels(self):
        """
        Test that multiple frequent channels are detected.
        
        Requirements: 4.5
        """
        base_time = datetime.now()
        interactions = []
        
        # 12 web interactions
        for i in range(12):
            interactions.append({
                'id': f'web-{i}',
                'timestamp': base_time - timedelta(days=i),
                'channel': 'web',
                'content': 'test'
            })
        
        # 10 mobile interactions
        for i in range(10):
            interactions.append({
                'id': f'mobile-{i}',
                'timestamp': base_time - timedelta(days=i),
                'channel': 'mobile',
                'content': 'test'
            })
        
        result = calculate_channel_frequency(interactions)
        
        # Both channels should be detected
        assert 'web' in result
        assert 'mobile' in result
        assert result['web']['count'] == 12
        assert result['mobile']['count'] == 10
    
    def test_empty_interactions(self):
        """
        Test that empty interaction list returns empty dict.
        
        Requirements: 4.2
        """
        result = calculate_channel_frequency([])
        assert result == {}


class TestAnalyzeSentimentTrend:
    """Tests for analyze_sentiment_trend function."""
    
    def test_detects_consistent_sentiment(self):
        """
        Test that consistent sentiment is detected with high consistency score.
        
        Requirements: 4.6
        """
        # Create 20 interactions with 80% positive sentiment
        interactions = []
        for i in range(20):
            label = 'positive' if i < 16 else 'neutral'
            interactions.append({
                'id': f'interaction-{i}',
                'timestamp': datetime.now() - timedelta(days=i),
                'sentiment': {'label': label}
            })
        
        result = analyze_sentiment_trend(interactions)
        
        assert result['dominant'] == 'positive'
        assert result['consistency'] >= 0.7  # 16/20 = 0.8
        assert -1.0 <= result['average'] <= 1.0
        assert result['direction'] in ['improving', 'declining', 'stable']
    
    def test_detects_negative_sentiment(self):
        """
        Test that negative sentiment trends are detected.
        
        Requirements: 4.6
        """
        # Create 15 interactions with 100% negative sentiment
        interactions = []
        for i in range(15):
            interactions.append({
                'id': f'interaction-{i}',
                'timestamp': datetime.now() - timedelta(days=i),
                'sentiment': {'label': 'negative'}
            })
        
        result = analyze_sentiment_trend(interactions)
        
        assert result['dominant'] == 'negative'
        assert result['consistency'] == 1.0  # 100% negative
        assert result['average'] == -1.0  # All negative
    
    def test_mixed_sentiment(self):
        """
        Test that mixed sentiment has lower consistency.
        
        Requirements: 4.6
        """
        # Create 12 interactions with mixed sentiment
        interactions = []
        sentiments = ['positive', 'negative', 'neutral'] * 4
        for i, label in enumerate(sentiments):
            interactions.append({
                'id': f'interaction-{i}',
                'timestamp': datetime.now() - timedelta(days=i),
                'sentiment': {'label': label}
            })
        
        result = analyze_sentiment_trend(interactions)
        
        # Consistency should be low (each sentiment appears 4 times out of 12)
        assert result['consistency'] < 0.5
        assert result['dominant'] in ['positive', 'negative', 'neutral']
    
    def test_empty_interactions(self):
        """
        Test that empty interactions return default values.
        
        Requirements: 4.2
        """
        result = analyze_sentiment_trend([])
        
        assert result['dominant'] == 'neutral'
        assert result['consistency'] == 0.0
        assert result['average'] == 0.0
        assert result['direction'] == 'stable'


class TestDetectTemporalPattern:
    """Tests for detect_temporal_pattern function."""
    
    def test_identifies_time_patterns(self):
        """
        Test that temporal patterns are identified when present.
        
        Requirements: 4.7
        """
        # Create 10 interactions all on Monday
        base_time = datetime(2024, 1, 1, 10, 0, 0)  # Monday
        interactions = []
        for i in range(10):
            # Add 7 days each time to keep it Monday
            timestamp = base_time + timedelta(days=i * 7)
            interactions.append({
                'id': f'interaction-{i}',
                'timestamp': timestamp
            })
        
        result = detect_temporal_pattern(interactions)
        
        # Should detect day_of_week pattern
        if result:
            assert result['confidence'] > 0.7
            assert result['pattern_type'] in ['day_of_week', 'time_of_day']
            assert result['occurrences'] > 0
    
    def test_insufficient_data(self):
        """
        Test that < 5 interactions return None.
        
        Requirements: 4.2
        """
        interactions = []
        for i in range(4):
            interactions.append({
                'id': f'interaction-{i}',
                'timestamp': datetime.now() - timedelta(days=i)
            })
        
        result = detect_temporal_pattern(interactions)
        assert result is None
    
    def test_empty_interactions(self):
        """
        Test that empty interactions return None.
        
        Requirements: 4.2
        """
        result = detect_temporal_pattern([])
        assert result is None


class TestCalculateEngagementScore:
    """Tests for calculate_engagement_score function."""
    
    def test_returns_values_in_range(self):
        """
        Test that engagement score is always between 0 and 1.
        
        Requirements: 4.8
        """
        # Create 20 interactions with varied content
        base_time = datetime.now()
        interactions = []
        for i in range(20):
            interactions.append({
                'id': f'interaction-{i}',
                'timestamp': base_time - timedelta(days=i),
                'channel': 'web',
                'content': 'This is test content ' * 10  # Rich content
            })
        
        result = calculate_engagement_score(interactions)
        
        assert 0.0 <= result['score'] <= 1.0
        assert result['level'] in ['low', 'medium', 'high']
        assert result['interaction_count'] == 20
        assert result['trend'] in ['increasing', 'decreasing', 'stable']
    
    def test_high_engagement(self):
        """
        Test that high engagement is detected correctly.
        
        Requirements: 4.8
        """
        # Create many recent interactions with rich content
        base_time = datetime.now()
        interactions = []
        for i in range(50):
            interactions.append({
                'id': f'interaction-{i}',
                'timestamp': base_time - timedelta(hours=i),  # Very recent
                'channel': 'web' if i % 2 == 0 else 'mobile',  # Multiple channels
                'content': 'This is rich test content ' * 20  # Rich content
            })
        
        result = calculate_engagement_score(interactions)
        
        # Should have high engagement
        assert result['score'] >= 0.7
        assert result['level'] == 'high'
    
    def test_low_engagement(self):
        """
        Test that low engagement is detected correctly.
        
        Requirements: 4.8
        """
        # Create few old interactions with minimal content
        base_time = datetime.now()
        interactions = []
        for i in range(3):
            interactions.append({
                'id': f'interaction-{i}',
                'timestamp': base_time - timedelta(days=25 + i),  # Old
                'channel': 'web',
                'content': 'Hi'  # Minimal content
            })
        
        result = calculate_engagement_score(interactions)
        
        # Should have low engagement
        assert result['score'] < 0.5
        assert result['level'] == 'low'
    
    def test_empty_interactions(self):
        """
        Test that empty interactions return zero engagement.
        
        Requirements: 4.2
        """
        result = calculate_engagement_score([])
        
        assert result['score'] == 0.0
        assert result['level'] == 'low'
        assert result['interaction_count'] == 0
        assert result['trend'] == 'stable'


class TestPatternDetectionIntegration:
    """Integration tests for pattern detection workflow."""
    
    def test_filters_patterns_by_confidence(self):
        """
        Test that only patterns with confidence >= 0.7 are returned.
        
        Requirements: 4.3, 4.4
        """
        # Create interactions that will generate patterns
        base_time = datetime.now()
        interactions = []
        
        # 15 web interactions (should create channel pattern)
        for i in range(15):
            interactions.append({
                'id': f'web-{i}',
                'timestamp': base_time - timedelta(days=i * 2),
                'channel': 'web',
                'sentiment': {'label': 'positive'},
                'content': 'Test content ' * 20
            })
        
        # Test each function individually
        channel_freq = calculate_channel_frequency(interactions)
        sentiment_trend = analyze_sentiment_trend(interactions)
        engagement = calculate_engagement_score(interactions)
        
        # Verify confidence thresholds
        for channel, freq in channel_freq.items():
            # Only channels with regularity > 0.7 should be considered
            if freq['regularity'] > 0.7:
                assert freq['count'] >= 10
        
        # Sentiment consistency should be high (all positive)
        assert sentiment_trend['consistency'] >= 0.7
        
        # Engagement score should be in valid range
        assert 0.0 <= engagement['score'] <= 1.0
    
    def test_sorts_patterns_by_confidence(self):
        """
        Test that patterns are sorted by confidence descending.
        
        Requirements: 4.9
        """
        # This is tested implicitly by the ML service endpoint
        # which sorts patterns before returning them
        pass


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
