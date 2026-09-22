# Example queries for the demo / proof post

Per the bounty's proof requirements, the public demo needs queries a 1B dense
model would typically fail on — multi-hop reasoning, synthesis across sources,
or comparison, not simple factual recall. Draft list (final answers to be
captured from the running app once on-device):

1. **Synthesis**: "Compare the tradeoffs of mmap-based weight streaming vs.
   fully loading a quantized model into RAM on a memory-constrained device —
   when would each approach lose?"
2. **Multi-hop reasoning**: "If a Mixture-of-Experts model has 100B total
   parameters but only activates 8B per token, and each parameter needs 1
   byte at Q8 quantization, what's the minimum plausible disk footprint, and
   why doesn't RAM usage scale with the 100B figure?"
3. **Comparison**: "Explain the practical difference between BM25 lexical
   search and cosine similarity over dense embeddings for local RAG — when
   does hybrid retrieval actually help vs. just adding noise?"
4. **Explanation with caveats**: "Why can't a phone running GrapheneOS use
   Google's on-device Gemini Nano APIs, and what has to be reimplemented
   instead?"
5. **Numeric/logical reasoning**: "A device has a 12GB RAM budget. The OS and
   app overhead take 2GB, the embedding model needs 200MB resident, and the
   primary LLM's KV cache at a 4096-token context needs 1.5GB. How much
   headroom is left for the LLM's active weight working set, and is a 9GB
   Q4_K_M MoE model with 2.7B active params safe to load here?"

A 1B dense model typically fails these because they require holding multiple
constraints in working memory and reasoning about tradeoffs, not just
retrieving a fact.
