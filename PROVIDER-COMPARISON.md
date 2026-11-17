# Provider comparison and activation policy

No external AI provider is enabled by this foundation. `/api/admin/providers` intentionally reports all engines as `not_configured`; the application does not fabricate success and does not issue paid requests.

| Capability | Candidate | Cost/license/infrastructure notes | State |
|---|---|---|---|
| Speech recognition | Whisper / whisper.cpp | Open-source software; model licenses and GPU/CPU/RAM needs depend on selected model and host | Not installed or configured |
| Speech synthesis | Piper, Kokoro | Check model/voice licenses independently; Arabic voice quality must be evaluated; CPU/GPU and storage required | Not installed or configured |
| Audio editing/separation | FFmpeg, Demucs | Self-hosted compute; FFmpeg build/license configuration and model licensing require review | Not installed or configured |
| Images | Self-hosted Stable Diffusion-compatible engine | Significant GPU/storage requirements; review checkpoint licenses and acceptable use | Not connected |
| Video/lip sync | Open-source video/audio pipelines | High compute requirements, variable model terms and operational complexity | Not connected |
| Durable file storage | S3-compatible object store | Configure separately; may incur hosting/egress costs; requires owner approval | Not configured |
| Email verification/reset | SMTP or transactional mail | External service and possible cost; must be approved and configured | Not configured |

Before enabling anything: verify current license and model terms, assess hosting resources, disclose possible infrastructure costs, implement server-side secrets, test Arabic speech output, and obtain owner approval. Do not confuse open-source software with free hosting or unrestricted model rights.
