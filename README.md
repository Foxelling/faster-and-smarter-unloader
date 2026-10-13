# Faster and Smarter Unloader

A performance-focused quality-of-life mod for Mindustry that makes unloaders significantly faster, smarter, and optimized for large-scale factories.

---

## Features

- **Blazing Fast Throughput:** Increased transfer speed up to **180 items per second**.
- **Highly Optimized (Lag-Free):** Built with smart neighbor topology caching and early exits, keeping your game running at high FPS even with hundreds of active unloaders on massive maps.
- **Smart Factory Routing:** Unloaders push raw materials into factories and exclusively extract finished products out.
- **Daisy-Chaining Identical Factories:** Need to power a long row of unit factories or crafters? Unloaders now intelligently balance input materials between adjacent identical factories using a gradient system (preventing item "ping-pong"). Finished products are never thrown between identical factories.
- **Infinite Loop Prevention:** 
  - Prevents pulling raw ingredients back out of a factory into external storage.
  - Eliminates infinite transfer loops between storage-to-storage and transport-to-storage blocks.
  - Prevents dumping into core blocks.

---

> **Note:** Because this mod enforces directional item logic (inputs into factories, outputs out of factories), some vanilla exploits or unintended reciprocal transfer schematics might behave differently.
