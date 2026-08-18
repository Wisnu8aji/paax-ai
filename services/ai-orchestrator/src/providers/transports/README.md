# Provider transports

Direktori ini akan menampung transport chat-completions, Anthropic, Bedrock,
Responses, dan provider lain yang disepakati pada phase implementasi.
Phase 1 tidak membuat client, retry, atau request model.
Implementasi transport ditargetkan Phase 3–6.
Semua transport harus dipanggil melalui runtime loop kanonik.
