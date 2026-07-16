import os
import re
import math
import numpy as np
import faiss
from typing import List, Dict, Any, Tuple, Set

class VectorSearchEngine:
    """
    Semantic vector search engine using TF-IDF and Latent Semantic Analysis (LSA)
    indexed with FAISS for fast CPU similarity search.
    """
    def __init__(self, embedding_dim: int = 64):
        self.embedding_dim = embedding_dim
        self.vocabulary: Dict[str, int] = {}
        self.idf: Dict[str, float] = {}
        self.projection_matrix: Optional[np.ndarray] = None  # SVD Projection matrix
        self.index: Optional[faiss.IndexFlatIP] = None       # FAISS Index
        self.file_paths: List[str] = []                       # Mapping index ID -> path
        
    def _tokenize(self, text: str) -> List[str]:
        """Convert code or text to word tokens."""
        if not text:
            return []
        # Keep words, split on symbols
        tokens = re.findall(r'[a-zA-Z0-9_]+', text.lower())
        # Filter out short or extremely long tokens
        return [t for t in tokens if 2 < len(t) < 30]

    def build_index(self, files: List[Dict[str, Any]]):
        """
        Build the TF-IDF LSA index and register vectors in the FAISS vector store.
        """
        if not files:
            return
            
        self.file_paths = [f.get("filePath", f.get("path", "")) for f in files]
        num_docs = len(files)
        
        # 1. Build vocabulary and term counts
        vocab_set: Set[str] = set()
        doc_tokens: List[List[str]] = []
        doc_freqs: Dict[str, int] = {}
        
        for file in files:
            tokens = self._tokenize(file.get("content", ""))
            doc_tokens.append(tokens)
            unique_tokens = set(tokens)
            vocab_set.update(unique_tokens)
            for token in unique_tokens:
                doc_freqs[token] = doc_freqs.get(token, 0) + 1
                
        self.vocabulary = {token: idx for idx, token in enumerate(sorted(vocab_set))}
        vocab_size = len(self.vocabulary)
        
        if vocab_size == 0:
            return

        # 2. Compute IDF
        self.idf = {}
        for token, freq in doc_freqs.items():
            self.idf[token] = math.log((num_docs + 1) / (freq + 0.5)) + 1.0
            
        # 3. Create TF-IDF Matrix
        tfidf_matrix = np.zeros((num_docs, vocab_size), dtype=np.float32)
        for i, tokens in enumerate(doc_tokens):
            token_counts = {}
            for t in tokens:
                token_counts[t] = token_counts.get(t, 0) + 1
            for token, count in token_counts.items():
                if token in self.vocabulary:
                    v_idx = self.vocabulary[token]
                    tf = count / len(tokens)
                    tfidf_matrix[i, v_idx] = tf * self.idf[token]
                    
        # 4. Dimensionality Reduction via SVD (LSA)
        # We project sparse TF-IDF onto dense semantic dimensions
        dim = min(self.embedding_dim, vocab_size, num_docs)
        if dim < 1:
            dim = 1
            
        # Center the matrix
        mean_vector = np.mean(tfidf_matrix, axis=0)
        centered_matrix = tfidf_matrix - mean_vector
        
        # Singular Value Decomposition
        try:
            # SVD: centered_matrix = U * S * Vt
            U, S, Vt = np.linalg.svd(centered_matrix, full_matrices=False)
            # Projection matrix to map TF-IDF to dense space: V_d
            self.projection_matrix = Vt[:dim].T # shape: (vocab_size, dim)
            # Dense document vectors: U * S
            dense_docs = centered_matrix @ self.projection_matrix
        except Exception:
            # Fallback to simple random projection matrix if SVD fails
            self.projection_matrix = np.random.randn(vocab_size, dim).astype(np.float32)
            dense_docs = centered_matrix @ self.projection_matrix
            
        # Normalize vectors for cosine similarity (Inner Product)
        norms = np.linalg.norm(dense_docs, axis=1, keepdims=True)
        # Avoid division by zero
        norms[norms == 0] = 1e-8
        normalized_dense_docs = (dense_docs / norms).astype(np.float32)
        
        # 5. Index using FAISS CPU Flat Inner Product
        self.index = faiss.IndexFlatIP(dim)
        self.index.add(normalized_dense_docs)
        
    def _project_query(self, query_text: str) -> np.ndarray:
        """Convert query to TF-IDF and project to dense LSA space."""
        if not self.index or self.projection_matrix is None:
            return np.zeros((1, 1), dtype=np.float32)
            
        vocab_size = len(self.vocabulary)
        dim = self.projection_matrix.shape[1]
        
        query_vector = np.zeros((1, vocab_size), dtype=np.float32)
        tokens = self._tokenize(query_text)
        if not tokens:
            return np.zeros((1, dim), dtype=np.float32)
            
        token_counts = {}
        for t in tokens:
            token_counts[t] = token_counts.get(t, 0) + 1
            
        for token, count in token_counts.items():
            if token in self.vocabulary:
                v_idx = self.vocabulary[token]
                tf = count / len(tokens)
                query_vector[0, v_idx] = tf * self.idf.get(token, 1.0)
                
        # Project to dense space
        dense_query = query_vector @ self.projection_matrix
        # Normalize
        norm = np.linalg.norm(dense_query)
        if norm > 0:
            dense_query = dense_query / norm
        return dense_query.astype(np.float32)

    def search(self, query: str, top_k: int = 5) -> List[Tuple[str, float]]:
        """
        Search the FAISS index for the query.
        Returns:
            List of tuples: (file_path, cosine_similarity_score)
        """
        if not self.index or not self.file_paths:
            return []
            
        query_vec = self._project_query(query)
        k = min(top_k, len(self.file_paths))
        
        # FAISS search: returns similarity scores and matching IDs
        scores, ids = self.index.search(query_vec, k)
        
        results = []
        for sim, idx in zip(scores[0], ids[0]):
            if idx < 0 or idx >= len(self.file_paths):
                continue
            results.append((self.file_paths[idx], float(sim)))
            
        return results

    def merge_results(
        self,
        keyword_results: List[Dict[str, Any]],
        semantic_results: List[Tuple[str, float]]
    ) -> List[Dict[str, Any]]:
        """
        Merge traditional keyword search results and semantic vector search results,
        ranking and scoring them.
        """
        merged_scores: Dict[str, float] = {}
        file_metadata: Dict[str, Dict[str, Any]] = {}
        
        # 1. Process keyword results (normalize scores to 0-1)
        max_kw_score = max((f.get("confidence", 0.5) for f in keyword_results), default=1.0)
        for rank, f in enumerate(keyword_results):
            path = f.get("filePath", f.get("path", ""))
            if not path:
                continue
            # Store metadata
            file_metadata[path] = f
            # Reciprocal rank scoring + normalized score
            keyword_score = f.get("confidence", 0.5) / max_kw_score
            merged_scores[path] = merged_scores.get(path, 0.0) + 0.5 * keyword_score + 0.3 * (1.0 / (rank + 1))

        # 2. Process semantic results (FAISS cosine similarity)
        for rank, (path, sim) in enumerate(semantic_results):
            merged_scores[path] = merged_scores.get(path, 0.0) + 0.6 * sim + 0.4 * (1.0 / (rank + 1))
            if path not in file_metadata:
                file_metadata[path] = {
                    "filePath": path,
                    "fileName": os.path.basename(path),
                    "matchType": "semantic",
                    "reason": "Retrieved via semantic vector search."
                }
                
        # 3. Sort files by merged scores
        sorted_paths = sorted(merged_scores.items(), key=lambda x: x[1], reverse=True)
        
        final_results = []
        for path, score in sorted_paths:
            f_meta = file_metadata[path].copy()
            f_meta["confidence"] = round(min(1.0, max(0.0, score)), 2)
            final_results.append(f_meta)
            
        return final_results
