import { useState } from "react";

// n8n webhook URL - development'ta proxy kullan, production'da direkt URL
const N8N_WEBHOOK_URL = "/api/n8n/webhook-test/generate-post";

// Zapier webhook URL for publishing
const ZAPIER_PUBLISH_WEBHOOK_URL = "/api/zapier/hooks/catch/25934798/uwktqr0/";

export function SocialPostGenerator() {
  const [channel, setChannel] = useState("Twitter");
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState("");
  const [generatedContent, setGeneratedContent] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleGenerate = async (e) => {
    e.preventDefault();

    if (!topic.trim()) {
      setError("Please enter a topic");
      return;
    }

    setIsLoading(true);
    setError("");
    setGeneratedContent("");
    setHashtags("");
    setImageUrl("");

    const requestBody = {
      channel,
      topic,
      ...(tone && { tone }),
    };

    console.log("Sending request to:", N8N_WEBHOOK_URL);
    console.log("Request body:", requestBody);

    try {
      const response = await fetch(N8N_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      console.log("Response status:", response.status);
      console.log("Response headers:", Object.fromEntries(response.headers.entries()));

      // Önce response'u text olarak oku (hem error hem success için)
      const responseText = await response.text();
      console.log("Response text (raw):", responseText);
      console.log("Response status:", response.status);
      console.log("Response headers:", Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        console.error("Error response body:", responseText);

        // HTML error response'ları için daha açıklayıcı mesaj
        if (responseText.includes("<!DOCTYPE html>") || responseText.includes("Internal Server Error")) {
          throw new Error(
            `n8n workflow hatası (500). Bu genellikle şu nedenlerden olur:\n` +
            `1. n8n workflow'unuzda "Respond to Webhook" node'u eksik veya yanlış yapılandırılmış\n` +
            `2. Workflow'da bir hata oluşuyor (n8n execution logs'ları kontrol edin)\n` +
            `3. Request formatı n8n'in beklediği formatta değil\n\n` +
            `Request gönderilen: ${JSON.stringify(requestBody, null, 2)}`
          );
        }

        throw new Error(`HTTP error! status: ${response.status}, message: ${responseText}`);
      }

      // Response başarılı, şimdi parse etmeye çalış
      let data;

      // Boş response kontrolü
      if (!responseText || responseText.trim().length === 0) {
        console.warn("Empty response received from n8n");
        throw new Error(
          "n8n'den boş response geldi. Workflow'unuzun 'Respond to Webhook' node'unda " +
          "response body döndürdüğünden emin olun."
        );
      }

      // JSON parse etmeye çalış
      try {
        data = JSON.parse(responseText);
        console.log("Response data (parsed):", data);
      } catch (parseError) {
        console.warn("Failed to parse JSON, treating as plain text:", parseError);
        // JSON değilse, text olarak kullan
        data = { content: responseText };
      }

      // Helper to recursively find text content in object
      const findTextRecursively = (obj) => {
        if (!obj) return null;
        // Look for an object with a 'text' property that is a string
        if (obj.text && typeof obj.text === 'string' && obj.text.length > 0) {
          return obj.text;
        }

        if (Array.isArray(obj)) {
          for (const item of obj) {
            const result = findTextRecursively(item);
            if (result) return result;
          }
        } else if (typeof obj === 'object') {
          for (const key in obj) {
            const result = findTextRecursively(obj[key]);
            if (result) return result;
          }
        }
        return null;
      };

      let content =
        data.post ||
        data.caption ||
        data.generatedContent ||
        data.content ||
        data.message ||
        data.text ||
        // Deeply nested structure support (prioritized direct access)
        data?.output?.output?.[0]?.content?.content?.[0]?.text?.text ||
        (Array.isArray(data) && data[0]?.output?.output?.[0]?.content?.content?.[0]?.text?.text) ||
        (data.body && (data.body.post || data.body.content || data.body.message)) ||
        // Recursive fallback
        (typeof data === 'object' ? findTextRecursively(data) : null) ||
        // Final fallback
        (typeof data === "string" ? data : JSON.stringify(data, null, 2));

      // Hashtags'i al
      const responseHashtags = data.hashtags || "";

      // Image'i al (base64 data URL formatında olabilir veya Fal.ai URL'i)
      let responseImage = data.image || null;

      // Recursive helper to find image URL (like Fal.ai structure or deeply nested URLs)
      const findImageRecursively = (obj) => {
        if (!obj) return null;

        // Check for direct Fal.ai style structure: { images: [{ url: "..." }] }
        if (obj.images && Array.isArray(obj.images) && obj.images[0]?.url) {
          return obj.images[0].url;
        }

        // Check for direct url property if it looks like an image
        if (obj.url && typeof obj.url === 'string' && (obj.url.startsWith('http') || obj.url.startsWith('data:image'))) {
          // Simple check, might need to be more specific if other URLs exist
          return obj.url;
        }

        // Check for 'image' property
        if (obj.image && typeof obj.image === 'string') {
          return obj.image;
        }

        if (Array.isArray(obj)) {
          for (const item of obj) {
            const result = findImageRecursively(item);
            if (result) return result;
          }
        } else if (typeof obj === 'object') {
          for (const key in obj) {
            const result = findImageRecursively(obj[key]);
            if (result) return result;
          }
        }
        return null;
      };

      if (!responseImage) {
        responseImage = findImageRecursively(data);
      }

      // Handle base64 image in 'data' field (Fallback)
      if (!responseImage) {
        const base64Data = data.data || (Array.isArray(data) && data.find(item => item.data)?.data);
        if (base64Data) {
          responseImage = base64Data.startsWith('data:')
            ? base64Data
            : `data:image/png;base64,${base64Data}`;
        }
      }

      if (!content || content.trim().length === 0) {
        throw new Error(
          "n8n'den response geldi ama içerik boş. Response formatını kontrol edin:\n" +
          JSON.stringify(data, null, 2)
        );
      }

      // Content'i set et (hashtags ile birlikte)
      const fullContent = responseHashtags
        ? `${content}\n\n${responseHashtags}`
        : content;

      setGeneratedContent(fullContent);
      setHashtags(responseHashtags);

      // Image varsa set et
      if (responseImage) {
        setImageUrl(responseImage);
      }
    } catch (err) {
      console.error("Error generating post:", err);
      setError(err.message || "Failed to generate post. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const [isPosting, setIsPosting] = useState(false);

  const handlePost = async () => {
    if (!generatedContent) return;

    setIsPosting(true);
    setError("");

    const requestBody = {
      platform: channel, // Zapier expects 'platform'
      content: generatedContent,
      image: imageUrl,
    };

    console.log("Sending publish request to:", ZAPIER_PUBLISH_WEBHOOK_URL);

    try {
      const response = await fetch(ZAPIER_PUBLISH_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      const responseText = await response.text();
      console.log("Publish response:", responseText);

      if (!response.ok) {
        throw new Error(`Failed to publish: ${responseText}`);
      }

      alert(`Successfully posted to ${channel}!`);
    } catch (err) {
      console.error("Error publishing post:", err);
      // Don't clear the generated content on error
      alert(`Error publishing: ${err.message}`);
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <div
      className="app-wrapper d-flex align-items-center justify-content-center p-4"
      style={{ minHeight: "100vh", backgroundColor: "#f5f6fb" }}
    >
      <div
        className="app-card bg-white p-4"
        style={{
          width: "100%",
          maxWidth: "640px",
          borderRadius: "24px",
          boxShadow: "0 20px 45px rgba(15, 23, 42, 0.15)",
        }}
      >
        {/* Заголовок */}
        <div className="text-center mb-4">
          <h2 className="fw-semibold mb-1">Social Post Generator</h2>
          <p className="text-muted mb-0">
            Create Twitter, Instagram, or LinkedIn posts from a single idea.
          </p>
        </div>

        {/* Форма */}
        <form onSubmit={handleGenerate}>
          {/* Channel */}
          <div className="mb-3">
            <label className="fw-medium mb-1" style={{ fontSize: ".9rem" }}>
              Channel
            </label>
            <select
              className="form-select"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
            >
              <option>Twitter</option>
              <option>Instagram</option>
              <option>LinkedIn</option>
            </select>
          </div>

          {/* Topic */}
          <div className="mb-3">
            <label className="fw-medium mb-1" style={{ fontSize: ".9rem" }}>
              Topic
            </label>
            <textarea
              className="form-control"
              rows="3"
              placeholder="e.g. Why founders should launch MVPs before the market gets crowded"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              required
            />
          </div>

          {/* Tone */}
          <div className="mb-4">
            <label className="fw-medium mb-1" style={{ fontSize: ".9rem" }}>
              Tone{" "}
              <span className="text-muted" style={{ fontSize: ".8rem" }}>
                (optional)
              </span>
            </label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. casual, bold, professional, friendly"
              value={tone}
              onChange={(e) => setTone(e.target.value)}
            />
          </div>

          {/* Error message */}
          {error && (
            <div className="alert alert-danger mb-3" role="alert">
              {error}
            </div>
          )}

          {/* Кнопка */}
          <div className="d-grid mb-4">
            <button
              className="btn btn-primary py-2 fw-semibold"
              type="submit"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                  Generating...
                </>
              ) : (
                "Generate post"
              )}
            </button>
          </div>

          {/* Generated content */}
          <div>
            <label className="fw-medium mb-1" style={{ fontSize: ".9rem" }}>
              Generated content
            </label>

            {/* Image göster (varsa) */}
            {imageUrl && (
              <div className="mb-3">
                <img
                  src={imageUrl}
                  alt="Generated post image"
                  className="img-fluid rounded"
                  style={{ maxHeight: "300px", width: "auto" }}
                />
              </div>
            )}

            <textarea
              className="form-control"
              style={{ minHeight: "140px" }}
              placeholder="Your generated post will appear here."
              value={generatedContent}
              onChange={(e) => setGeneratedContent(e.target.value)}
              readOnly
            />

            {/* Hashtags ayrı göster (opsiyonel) */}
            {hashtags && (
              <div className="mt-2">
                <small className="text-muted">Hashtags:</small>
                <div className="text-muted" style={{ fontSize: "0.9rem" }}>
                  {hashtags}
                </div>
              </div>
            )}
          </div>

          {/* Post Button */}
          {generatedContent && (
            <div className="d-grid mt-4">
              <button
                className="btn btn-success py-2 fw-semibold"
                type="button"
                onClick={handlePost}
                disabled={isPosting}
              >
                {isPosting ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                    Posting to {channel}...
                  </>
                ) : (
                  `Post to ${channel}`
                )}
              </button>
            </div>
          )}
        </form>
      </div >
    </div >
  );
}
