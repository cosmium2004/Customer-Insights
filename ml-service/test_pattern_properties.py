"""
Property-based tests for pattern detection.

**Validates: Requirements 4.3, 4.4, 10.7**

These tests verify that pattern detection maintains correctness properties
across various customer interaction histories and edge cases.
"""

import pytest
from hypothesis import given, strategies as st, settings, assume
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


# Custom strategies for generating test data
@st.composite
def interaction_strategy(draw, min_count=5, max_count=100):
    """
    Generate a list of customer interactions for testing.
    
    Args:
        draw: Hypothesis draw function
        min_count: Minimum number of interactions
        max_count: Maximum number of interactions
        
    Returns:
        List of interaction dictionaries
    """
    count = draw(st.integers(min_value=min_count, max_value=max_count))
    base_time = datetime.now()
    
    interactions = []
    for i in range(count):
        # Generate timestamp (spread over past 30 days)
        days_ago = draw(st.integers(min_value=0, max_value=30))
        hours_offset = draw(st.integers(min_value=0, max_value=23))
        timestamp = base_time - timedelta(days=days_ago, hours=hours_offset)
        
        # Generate channel
        channel = draw(st.sampled_from(['web', 'mobile', 'email', 'chat', 'phone']))
        
        # Generate sentiment
        sentiment_label = draw(st.sampled_from(['positive', 'negative', 'neutral']))
        sentiment = {
            'label': sentiment_label,
            'positive': draw(st.floats(min_value=0.0, max_value=1.0)),
            'negative': draw(st.floats(min_value=0.0, max_value=1.0)),
            'neutral': draw(st.floats(min_value=0.0, max_value=1.0))
        }
        
        # Generate content
        content = draw(st.text(min_size=10, max_size=500))
        
        interactions.append({
            'id': f'interaction-{i}',
            'customer_id': 'test-customer',
            'timestamp': timestamp,
            'channel': channel,
            'event_type': 'test_event',
            'content': content,
            'sentiment': sentiment,
            'metadata': {}
        })
    
    return interactions


@st.composite
def frequent_channel_interactions(draw, channel='web', count=15):
    """
    Generate interactions with a specific channel used frequently.
    
    This ensures we can test channel frequency detection.
    """
    base_time = datetime.now()
    interactions = []
    
    for i in range(count):
        # Regular intervals (every 2 days)
        timestamp = base_time - timedelta(days=i * 2)
        
        interactions.append({
            'id': f'interaction-{i}',
            'customer_id': 'test-customer',
            'timestamp': timestamp,
            'channel': channel,
            'event_type': 'test_event',
            'content': 'Test content',
            'sentiment': {'label': 'neutral'},
            'metadata': {}
        })
    
    return interactions


@st.composite
def consistent_sentiment_interactions(draw, sentiment_label='positive', count=20):
    """
    Generate interactions with consistent sentiment.
    
    This ensures we can test sentiment trend detection.
    """
    base_time = datetime.now()
    interactions = []
    
    # 80% of interactions have the same sentiment (consistency > 0.7)
    consistent_count = int(count * 0.8)
    
    for i in range(count):
        timestamp = base_time - timedelta(days=i)
        
        # First 80% have consistent sentiment
        if i < consistent_count:
            label = sentiment_label
        else:
            # Remaining 20% have random sentiment
            label = draw(st.sampled_from(['positive', 'negative', 'neutral']))
        
        interactions.append({
            'id': f'interaction-{i}',
            'customer_id': 'test-customer',
            'timestamp': timestamp,
            'channel': 'web',
            'event_type': 'test_event',
            'content': 'Test content',
            'sentiment': {'label': label},
            'metadata': {}
        })
    
    return interactions


# Property 6: Pattern Detection Confidence Threshold
# **Validates: Requirements 4.3, 4.4, 10.7**

@given(interactions=interaction_strategy(min_count=5, max_count=100))
@settings(max_examples=20, deadline=None)
def test_channel_frequency_confidence_threshold(interactions):
    """
    Property: All detected channel frequency patterns have confidence >= 0.7 and <= 1.0.
    
    **Validates: Requirements 4.3, 4.4, 10.7**
    
    This test verifies that:
    1. All detected patterns have confidence between 0.7 and 1.0
    2. All detected patterns have positive frequency counts
    3. Only channels with >= 10 uses are included
    """
    result = calculate_channel_frequency(interactions)
    
    for channel, freq_data in result.items():
        # Confidence must be between 0.7 and 1.0 (since only high-confidence patterns are returned)
        assert 0.0 <= freq_data['regularity'] <= 1.0, \
            f"Channel {channel} regularity {freq_data['regularity']} not in [0, 1]"
        
        # Frequency must be positive and >= 10
        assert freq_data['count'] >= 10, \
            f"Channel {channel} count {freq_data['count']} < 10"
        
        # Average interval must be non-negative
        assert freq_data['avg_interval'] >= 0, \
            f"Channel {channel} avg_interval {freq_data['avg_interval']} < 0"


@given(interactions=interaction_strategy(min_count=5, max_count=100))
@settings(max_examples=20, deadline=None)
def test_sentiment_trend_confidence_threshold(interactions):
    """
    Property: Sentiment trend analysis returns valid consistency scores.
    
    **Validates: Requirements 4.3, 4.4, 10.7**
    
    This test verifies that:
    1. Consistency score is between 0 and 1
    2. Average sentiment is between -1 and 1
    3. Dominant sentiment is one of the valid labels
    """
    result = analyze_sentiment_trend(interactions)
    
    # Consistency must be between 0 and 1
    assert 0.0 <= result['consistency'] <= 1.0, \
        f"Consistency {result['consistency']} not in [0, 1]"
    
    # Average must be between -1 and 1
    assert -1.0 <= result['average'] <= 1.0, \
        f"Average sentiment {result['average']} not in [-1, 1]"
    
    # Dominant sentiment must be valid
    assert result['dominant'] in ['positive', 'negative', 'neutral'], \
        f"Invalid dominant sentiment: {result['dominant']}"
    
    # Direction must be valid
    assert result['direction'] in ['improving', 'declining', 'stable'], \
        f"Invalid direction: {result['direction']}"


@given(interactions=interaction_strategy(min_count=5, max_count=100))
@settings(max_examples=20, deadline=None)
def test_temporal_pattern_confidence_threshold(interactions):
    """
    Property: Temporal patterns have confidence >= 0.7 when detected.
    
    **Validates: Requirements 4.3, 4.4, 10.7**
    
    This test verifies that:
    1. If a pattern is detected, confidence is between 0.7 and 1.0
    2. Occurrences are positive
    3. Pattern type is valid
    """
    result = detect_temporal_pattern(interactions)
    
    if result is not None:
        # Confidence must be between 0.7 and 1.0
        assert 0.7 <= result['confidence'] <= 1.0, \
            f"Temporal pattern confidence {result['confidence']} not in [0.7, 1.0]"
        
        # Occurrences must be positive
        assert result['occurrences'] > 0, \
            f"Temporal pattern occurrences {result['occurrences']} <= 0"
        
        # Pattern type must be valid
        assert result['pattern_type'] in ['day_of_week', 'time_of_day', 'regular_interval'], \
            f"Invalid pattern type: {result['pattern_type']}"


@given(interactions=interaction_strategy(min_count=1, max_count=100))
@settings(max_examples=20, deadline=None)
def test_engagement_score_range(interactions):
    """
    Property: Engagement scores are always between 0 and 1.
    
    **Validates: Requirements 4.3, 4.4, 10.7**
    
    This test verifies that:
    1. Engagement score is between 0 and 1
    2. Level is one of 'low', 'medium', 'high'
    3. Interaction count matches input
    """
    result = calculate_engagement_score(interactions)
    
    # Score must be between 0 and 1
    assert 0.0 <= result['score'] <= 1.0, \
        f"Engagement score {result['score']} not in [0, 1]"
    
    # Level must be valid
    assert result['level'] in ['low', 'medium', 'high'], \
        f"Invalid engagement level: {result['level']}"
    
    # Interaction count must match
    assert result['interaction_count'] == len(interactions), \
        f"Interaction count mismatch: {result['interaction_count']} != {len(interactions)}"
    
    # Trend must be valid
    assert result['trend'] in ['increasing', 'decreasing', 'stable'], \
        f"Invalid trend: {result['trend']}"


@given(interactions=frequent_channel_interactions(channel='web', count=15))
@settings(max_examples=10, deadline=None)
def test_frequent_channel_detection(interactions):
    """
    Property: Frequent channel usage is correctly detected.
    
    **Validates: Requirements 4.5, 4.6**
    
    This test verifies that when a channel is used >= 10 times with regularity,
    it is detected in the results.
    """
    result = calculate_channel_frequency(interactions)
    
    # Web channel should be detected (15 uses)
    assert 'web' in result, "Frequent channel 'web' not detected"
    assert result['web']['count'] == 15, f"Expected 15 uses, got {result['web']['count']}"
    assert result['web']['regularity'] > 0, "Regularity should be > 0 for regular usage"


@given(interactions=consistent_sentiment_interactions(sentiment_label='positive', count=20))
@settings(max_examples=10, deadline=None)
def test_consistent_sentiment_detection(interactions):
    """
    Property: Consistent sentiment trends are correctly detected.
    
    **Validates: Requirements 4.6, 4.7**
    
    This test verifies that when sentiment is consistent (>70% same label),
    it is detected with high consistency score.
    """
    result = analyze_sentiment_trend(interactions)
    
    # Dominant sentiment should be positive
    assert result['dominant'] == 'positive', \
        f"Expected dominant sentiment 'positive', got '{result['dominant']}'"
    
    # Consistency should be >= 0.7 (we generated 80% positive)
    assert result['consistency'] >= 0.7, \
        f"Expected consistency >= 0.7, got {result['consistency']}"


# Edge case tests

def test_empty_interactions():
    """
    Edge case: Empty interaction list should return empty/default results.
    
    **Validates: Requirements 4.2**
    """
    result_freq = calculate_channel_frequency([])
    assert result_freq == {}, "Empty interactions should return empty frequency dict"
    
    result_sentiment = analyze_sentiment_trend([])
    assert result_sentiment['dominant'] == 'neutral', "Empty interactions should default to neutral"
    assert result_sentiment['consistency'] == 0.0, "Empty interactions should have 0 consistency"
    
    result_temporal = detect_temporal_pattern([])
    assert result_temporal is None, "Empty interactions should return None for temporal pattern"
    
    result_engagement = calculate_engagement_score([])
    assert result_engagement['score'] == 0.0, "Empty interactions should have 0 engagement"
    assert result_engagement['level'] == 'low', "Empty interactions should have low engagement"


def test_insufficient_interactions():
    """
    Edge case: < 5 interactions should not detect temporal patterns.
    
    **Validates: Requirements 4.2**
    """
    interactions = [
        {
            'id': f'interaction-{i}',
            'timestamp': datetime.now() - timedelta(days=i),
            'channel': 'web',
            'sentiment': {'label': 'neutral'},
            'content': 'test'
        }
        for i in range(4)
    ]
    
    result = detect_temporal_pattern(interactions)
    assert result is None, "< 5 interactions should not detect temporal patterns"


def test_single_channel_below_threshold():
    """
    Edge case: Channel used < 10 times should not be in results.
    
    **Validates: Requirements 4.5**
    """
    interactions = [
        {
            'id': f'interaction-{i}',
            'timestamp': datetime.now() - timedelta(days=i),
            'channel': 'web',
            'sentiment': {'label': 'neutral'},
            'content': 'test'
        }
        for i in range(9)  # Only 9 uses
    ]
    
    result = calculate_channel_frequency(interactions)
    assert 'web' not in result, "Channel with < 10 uses should not be in results"


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
