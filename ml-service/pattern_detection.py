"""
Behavior pattern detection module.

This module provides functions to detect behavioral patterns in customer interactions,
including channel frequency, sentiment trends, temporal patterns, and engagement scores.
"""

import logging
from typing import Dict, List, Optional
from datetime import datetime, timedelta
from collections import Counter, defaultdict
import statistics

logger = logging.getLogger(__name__)


def calculate_channel_frequency(interactions: List[Dict]) -> Dict[str, Dict]:
    """
    Calculate channel usage frequency and regularity.
    
    Identifies channels that are used frequently (>= 10 times) with high regularity (> 0.7).
    Regularity is measured by the consistency of time intervals between interactions.
    
    Args:
        interactions: List of interaction dictionaries with 'channel' and 'timestamp' fields
        
    Returns:
        Dictionary mapping channel names to frequency data:
            - count: Number of times channel was used
            - regularity: Score from 0-1 indicating consistency of usage (1 = perfectly regular)
            - avg_interval: Average time interval between interactions in hours
            
    Preconditions:
        - interactions is a non-empty list
        - Each interaction has 'channel' and 'timestamp' fields
        
    Postconditions:
        - Returns dict with channel frequency data
        - regularity scores are between 0 and 1
        - Only includes channels with count >= 10
    """
    if not interactions:
        return {}
    
    # Group interactions by channel
    channel_interactions = defaultdict(list)
    for interaction in interactions:
        channel = interaction.get('channel')
        timestamp = interaction.get('timestamp')
        if channel and timestamp:
            channel_interactions[channel].append(timestamp)
    
    result = {}
    
    for channel, timestamps in channel_interactions.items():
        count = len(timestamps)
        
        # Only consider channels with >= 10 uses
        if count < 10:
            continue
        
        # Sort timestamps
        sorted_timestamps = sorted(timestamps)
        
        # Calculate time intervals between consecutive interactions
        intervals = []
        for i in range(1, len(sorted_timestamps)):
            if isinstance(sorted_timestamps[i], str):
                t1 = datetime.fromisoformat(sorted_timestamps[i-1].replace('Z', '+00:00'))
                t2 = datetime.fromisoformat(sorted_timestamps[i].replace('Z', '+00:00'))
            else:
                t1 = sorted_timestamps[i-1]
                t2 = sorted_timestamps[i]
            
            interval_hours = (t2 - t1).total_seconds() / 3600
            intervals.append(interval_hours)
        
        # Calculate regularity based on coefficient of variation
        # Lower CV = more regular usage pattern
        if intervals and len(intervals) > 1:
            avg_interval = statistics.mean(intervals)
            if avg_interval > 0:
                std_dev = statistics.stdev(intervals)
                cv = std_dev / avg_interval  # Coefficient of variation
                
                # Convert CV to regularity score (0-1, where 1 is most regular)
                # CV of 0 = regularity of 1.0
                # CV of 1 or more = regularity approaching 0
                regularity = max(0.0, min(1.0, 1.0 / (1.0 + cv)))
            else:
                regularity = 0.0
                avg_interval = 0.0
        else:
            regularity = 0.0
            avg_interval = 0.0
        
        result[channel] = {
            'count': count,
            'regularity': regularity,
            'avg_interval': avg_interval
        }
    
    return result


def analyze_sentiment_trend(interactions: List[Dict]) -> Dict:
    """
    Analyze sentiment trends across interactions.
    
    Detects consistent sentiment patterns by analyzing the distribution and
    consistency of sentiment labels across all interactions.
    
    Args:
        interactions: List of interaction dictionaries with 'sentiment' field
        
    Returns:
        Dictionary containing:
            - dominant: Most common sentiment label
            - consistency: Score from 0-1 indicating how consistent the sentiment is
            - average: Average sentiment score (-1 to 1, negative to positive)
            - direction: Trend direction ('stable', 'improving', 'declining')
            
    Preconditions:
        - interactions is a non-empty list
        - Each interaction has 'sentiment' field (dict with positive/negative/neutral scores)
        
    Postconditions:
        - Returns dict with sentiment trend data
        - consistency score is between 0 and 1
        - average is between -1 and 1
    """
    if not interactions:
        return {
            'dominant': 'neutral',
            'consistency': 0.0,
            'average': 0.0,
            'direction': 'stable'
        }
    
    # Extract sentiment labels and scores
    sentiment_labels = []
    sentiment_scores = []  # Numeric: -1 (negative), 0 (neutral), 1 (positive)
    
    for interaction in interactions:
        sentiment = interaction.get('sentiment')
        if sentiment:
            # Handle both dict format and string format
            if isinstance(sentiment, dict):
                label = sentiment.get('label', 'neutral')
            else:
                label = sentiment
            
            sentiment_labels.append(label)
            
            # Convert to numeric score
            if label == 'positive':
                sentiment_scores.append(1.0)
            elif label == 'negative':
                sentiment_scores.append(-1.0)
            else:
                sentiment_scores.append(0.0)
    
    if not sentiment_labels:
        return {
            'dominant': 'neutral',
            'consistency': 0.0,
            'average': 0.0,
            'direction': 'stable'
        }
    
    # Find dominant sentiment
    label_counts = Counter(sentiment_labels)
    dominant = label_counts.most_common(1)[0][0]
    
    # Calculate consistency (proportion of dominant sentiment)
    consistency = label_counts[dominant] / len(sentiment_labels)
    
    # Calculate average sentiment score
    average = statistics.mean(sentiment_scores) if sentiment_scores else 0.0
    
    # Determine trend direction by comparing first half vs second half
    if len(sentiment_scores) >= 4:
        mid = len(sentiment_scores) // 2
        first_half_avg = statistics.mean(sentiment_scores[:mid])
        second_half_avg = statistics.mean(sentiment_scores[mid:])
        
        diff = second_half_avg - first_half_avg
        if diff > 0.2:
            direction = 'improving'
        elif diff < -0.2:
            direction = 'declining'
        else:
            direction = 'stable'
    else:
        direction = 'stable'
    
    return {
        'dominant': dominant,
        'consistency': consistency,
        'average': average,
        'direction': direction
    }


def detect_temporal_pattern(interactions: List[Dict]) -> Optional[Dict]:
    """
    Detect time-based interaction patterns.
    
    Identifies patterns in when customers interact (e.g., specific days of week,
    times of day, or regular intervals).
    
    Args:
        interactions: List of interaction dictionaries with 'timestamp' field
        
    Returns:
        Dictionary containing temporal pattern data if detected, None otherwise:
            - pattern_type: Type of pattern ('day_of_week', 'time_of_day', 'regular_interval')
            - confidence: Score from 0-1 indicating pattern strength
            - description: Human-readable description of the pattern
            - metadata: Additional pattern-specific data
            - occurrences: Number of times pattern was observed
            
    Preconditions:
        - interactions is a non-empty list
        - Each interaction has 'timestamp' field
        
    Postconditions:
        - Returns dict with temporal pattern data or None
        - confidence score is between 0 and 1
    """
    if not interactions or len(interactions) < 5:
        return None
    
    # Extract timestamps
    timestamps = []
    for interaction in interactions:
        ts = interaction.get('timestamp')
        if ts:
            if isinstance(ts, str):
                timestamps.append(datetime.fromisoformat(ts.replace('Z', '+00:00')))
            else:
                timestamps.append(ts)
    
    if len(timestamps) < 5:
        return None
    
    # Analyze day of week pattern
    day_counts = Counter([ts.weekday() for ts in timestamps])
    most_common_day, day_count = day_counts.most_common(1)[0]
    day_confidence = day_count / len(timestamps)
    
    # Analyze time of day pattern (group into 4-hour blocks)
    hour_blocks = [ts.hour // 4 for ts in timestamps]  # 0-5 blocks (0-3, 4-7, 8-11, 12-15, 16-19, 20-23)
    block_counts = Counter(hour_blocks)
    most_common_block, block_count = block_counts.most_common(1)[0]
    time_confidence = block_count / len(timestamps)
    
    # Choose the strongest pattern
    if day_confidence > 0.7 and day_confidence >= time_confidence:
        day_names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        return {
            'pattern_type': 'day_of_week',
            'confidence': day_confidence,
            'description': f'Customer frequently interacts on {day_names[most_common_day]}',
            'metadata': {
                'day_of_week': most_common_day,
                'day_name': day_names[most_common_day]
            },
            'occurrences': day_count
        }
    elif time_confidence > 0.7:
        block_ranges = ['12am-4am', '4am-8am', '8am-12pm', '12pm-4pm', '4pm-8pm', '8pm-12am']
        return {
            'pattern_type': 'time_of_day',
            'confidence': time_confidence,
            'description': f'Customer frequently interacts during {block_ranges[most_common_block]}',
            'metadata': {
                'hour_block': most_common_block,
                'time_range': block_ranges[most_common_block]
            },
            'occurrences': block_count
        }
    
    return None


def calculate_engagement_score(interactions: List[Dict]) -> Dict:
    """
    Calculate customer engagement score based on interaction patterns.
    
    Engagement is measured by interaction frequency, recency, diversity of channels,
    and content richness.
    
    Args:
        interactions: List of interaction dictionaries
        
    Returns:
        Dictionary containing:
            - score: Engagement score from 0-1
            - level: Engagement level ('low', 'medium', 'high')
            - interaction_count: Total number of interactions
            - trend: Engagement trend ('increasing', 'decreasing', 'stable')
            
    Preconditions:
        - interactions is a non-empty list
        - Each interaction has 'timestamp', 'channel', and optionally 'content' fields
        - Interactions are sorted by timestamp ascending
        
    Postconditions:
        - Returns dict with engagement data
        - score is between 0 and 1
        - level is one of 'low', 'medium', 'high'
    """
    if not interactions:
        return {
            'score': 0.0,
            'level': 'low',
            'interaction_count': 0,
            'trend': 'stable'
        }
    
    interaction_count = len(interactions)
    
    # Factor 1: Interaction frequency (normalized to 0-1)
    # More interactions = higher engagement
    frequency_score = min(1.0, interaction_count / 50.0)  # 50+ interactions = max score
    
    # Factor 2: Recency (how recent is the last interaction)
    timestamps = []
    for interaction in interactions:
        ts = interaction.get('timestamp')
        if ts:
            if isinstance(ts, str):
                timestamps.append(datetime.fromisoformat(ts.replace('Z', '+00:00')))
            else:
                timestamps.append(ts)
    
    if timestamps:
        last_interaction = max(timestamps)
        days_since_last = (datetime.now(last_interaction.tzinfo) - last_interaction).days
        recency_score = max(0.0, 1.0 - (days_since_last / 30.0))  # Decay over 30 days
    else:
        recency_score = 0.0
    
    # Factor 3: Channel diversity
    channels = set(interaction.get('channel') for interaction in interactions if interaction.get('channel'))
    diversity_score = min(1.0, len(channels) / 3.0)  # 3+ channels = max score
    
    # Factor 4: Content richness (for text-based interactions)
    content_lengths = []
    for interaction in interactions:
        content = interaction.get('content', '')
        if content and isinstance(content, str):
            content_lengths.append(len(content))
    
    if content_lengths:
        avg_content_length = statistics.mean(content_lengths)
        richness_score = min(1.0, avg_content_length / 200.0)  # 200+ chars = max score
    else:
        richness_score = 0.5  # Neutral score for non-text interactions
    
    # Calculate weighted engagement score
    score = (
        frequency_score * 0.35 +
        recency_score * 0.30 +
        diversity_score * 0.20 +
        richness_score * 0.15
    )
    
    # Determine engagement level
    if score >= 0.7:
        level = 'high'
    elif score >= 0.4:
        level = 'medium'
    else:
        level = 'low'
    
    # Determine trend by comparing first half vs second half
    if len(interactions) >= 4:
        mid = len(interactions) // 2
        first_half_count = mid
        second_half_count = len(interactions) - mid
        
        # Compare interaction rates
        if second_half_count > first_half_count * 1.2:
            trend = 'increasing'
        elif second_half_count < first_half_count * 0.8:
            trend = 'decreasing'
        else:
            trend = 'stable'
    else:
        trend = 'stable'
    
    return {
        'score': score,
        'level': level,
        'interaction_count': interaction_count,
        'trend': trend
    }
