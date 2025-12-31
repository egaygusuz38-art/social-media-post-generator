# Social Media Post Generator

React + Vite tabanlı sosyal medya post generator uygulaması. n8n webhook entegrasyonu ile çalışır.

## Kurulum

1. Bağımlılıkları yükleyin:
```bash
npm install
```

2. Environment değişkenlerini yapılandırın:
```bash
cp .env.example .env
```

3. `.env` dosyasını açın ve n8n webhook URL'nizi girin:
```
VITE_N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/generate-post
```

## n8n Webhook Yapılandırması

n8n workflow'unuzda bir webhook node'u oluşturun ve şu formatı bekleyin:

**Gelen Request Body:**
```json
{
  "channel": "Twitter", // veya "Instagram", "LinkedIn"
  "topic": "Your topic here",
  "tone": "casual" // optional
}
```

**Dönen Response (n8n'den):**
```json
{
  "post": "Generated post content here"
}
```
veya
```json
{
  "generatedContent": "Generated post content here"
}
```
veya
```json
{
  "content": "Generated post content here"
}
```

## Geliştirme

Development server'ı başlatın:
```bash
npm run dev
```

## Build

Production build için:
```bash
npm run build
```
