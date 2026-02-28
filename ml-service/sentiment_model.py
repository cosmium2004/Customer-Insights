"""
Sentiment analysis model module.

This module handles loading pre-trained sentiment analysis models and running predictions.
Uses the transformers library for NLP models.
"""

import time
import logging
from typing import Dict, Optional
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch.nn.functional as F

from preprocessing import preprocess_text, truncate_text

logger = logging.getLogger(__name__)


class SentimentModel:
    """
    Sentiment analysis model wrapper.
    
    Loads and manages a pre-trained sentiment analysis model from Hugging Face.
    Provides methods for text preprocessing and sentiment prediction.
    """
    
    def __init__(self, model_name: str = "distilbert-base-uncased-finetuned-sst-2-english"):
        """
        Initialize the sentiment model.
        
        Args:
            model_name: Name of the pre-trained model from Hugging Face
        """
        self.model_name = model_name
        self.tokenizer: Optional[AutoTokenizer] = None
        self.model: Optional[AutoModelForSequenceClassification] = None
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.max_length = 512
        
        logger.info(f"Initializing sentiment model: {model_name}")
        logger.info(f"Using device: {self.device}")
    
    def load_model(self) -> None:
        """
        Load the pre-trained model and tokenizer into memory.
        
        This should be called during application startup.
        """
        try:
            logger.info(f"Loading tokenizer for {self.model_name}")
            self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)
            
            logger.info(f"Loading model for {self.model_name}")
            self.model = AutoModelForSequenceClassification.from_pretrained(self.model_name)
            self.model.to(self.device)
            self.model.eval()  # Set to evaluation mode
            
            logger.info("Model loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load model: {str(e)}")
            raise
    
    def is_loaded(self) -> bool:
        """Check if model is loaded and ready for predictions."""
        return self.tokenizer is not None and self.model is not None
    
    def predict_sentiment(self, text: str) -> Dict[str, any]:
        """
        Predict sentiment for a given text.
        
        Args:
            text: Input text to analyze
            
        Returns:
            Dictionary containing:
                - sentiment: str (positive, negative, or neutral)
                - confidence: float (0-1)
                - scores: dict with positive, negative, neutral scores
                - processing_time_ms: float
                
        Raises:
            ValueError: If text is empty or model is not loaded
            RuntimeError: If prediction fails
        """
        start_time = time.time()
        
        if not self.is_loaded():
            raise RuntimeError("Model is not loaded. Call load_model() first.")
        
        if not text or not text.strip():
            raise ValueError("Text cannot be empty")
        
        try:
            # Step 1: Preprocess text
            preprocessed = preprocess_text(text)
            
            # Step 2: Truncate if needed (for texts under 1000 chars, this ensures SLA)
            preprocessed = truncate_text(preprocessed, max_length=1000)
            
            # Step 3: Tokenize and encode for model input
            inputs = self.tokenizer(
                preprocessed,
                max_length=self.max_length,
                truncation=True,
                padding='max_length',
                return_tensors='pt'
            )
            
            # Move inputs to device
            inputs = {k: v.to(self.device) for k, v in inputs.items()}
            
            # Step 4: Run inference with torch.no_grad()
            with torch.no_grad():
                outputs = self.model(**inputs)
                logits = outputs.logits
            
            # Step 5: Calculate softmax probabilities
            probabilities = F.softmax(logits, dim=1)[0]
            
            # Step 6: Map to sentiment labels
            # For binary sentiment models (positive/negative)
            if probabilities.shape[0] == 2:
                scores = {
                    'negative': float(probabilities[0]),
                    'positive': float(probabilities[1]),
                    'neutral': 0.0
                }
            # For 3-class models (negative/neutral/positive)
            elif probabilities.shape[0] == 3:
                scores = {
                    'negative': float(probabilities[0]),
                    'neutral': float(probabilities[1]),
                    'positive': float(probabilities[2])
                }
            else:
                # Fallback for other model types
                scores = {
                    'negative': float(probabilities[0]) if len(probabilities) > 0 else 0.0,
                    'neutral': float(probabilities[1]) if len(probabilities) > 1 else 0.0,
                    'positive': float(probabilities[2]) if len(probabilities) > 2 else 0.0,
                }
            
            # Normalize scores to sum to 1.0 (handle binary models)
            total = sum(scores.values())
            if total > 0:
                scores = {k: v / total for k, v in scores.items()}
            
            # Step 7: Determine sentiment label and confidence
            sentiment = max(scores, key=scores.get)
            confidence = scores[sentiment]
            
            # Step 8: Calculate processing time
            processing_time = (time.time() - start_time) * 1000  # Convert to ms
            
            # Step 9: Log warning if processing time exceeds threshold
            if processing_time > 500:
                logger.warning(
                    f"Prediction exceeded SLA: {processing_time:.2f}ms "
                    f"(text length: {len(text)} chars)"
                )
            
            return {
                'sentiment': sentiment,
                'confidence': confidence,
                'scores': scores,
                'processing_time_ms': processing_time
            }
            
        except ValueError as e:
            # Re-raise validation errors
            raise
        except Exception as e:
            logger.error(f"Prediction failed: {str(e)}", exc_info=True)
            raise RuntimeError(f"Prediction failed: {str(e)}")
    
    def batch_predict(self, texts: list[str], batch_size: int = 32) -> list[Dict[str, any]]:
        """
        Predict sentiment for multiple texts in batches.
        
        Args:
            texts: List of texts to analyze
            batch_size: Number of texts to process in each batch (default: 32)
            
        Returns:
            List of prediction dictionaries
        """
        if not texts:
            return []
        
        results = []
        
        # Process in batches
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            
            for text in batch:
                try:
                    result = self.predict_sentiment(text)
                    results.append(result)
                except Exception as e:
                    logger.error(f"Failed to predict sentiment for text: {str(e)}")
                    # Return error result for this text
                    results.append({
                        'sentiment': 'neutral',
                        'confidence': 0.0,
                        'scores': {'positive': 0.0, 'negative': 0.0, 'neutral': 1.0},
                        'processing_time_ms': 0.0,
                        'error': str(e)
                    })
        
        return results


# Global model instance
_model_instance: Optional[SentimentModel] = None


def get_model() -> SentimentModel:
    """
    Get the global sentiment model instance.
    
    Returns:
        SentimentModel instance
    """
    global _model_instance
    if _model_instance is None:
        _model_instance = SentimentModel()
    return _model_instance


def load_model_on_startup() -> None:
    """
    Load the sentiment model during application startup.
    
    This function should be called when the FastAPI app starts.
    """
    model = get_model()
    if not model.is_loaded():
        model.load_model()
        logger.info("Sentiment model loaded and ready for predictions")
