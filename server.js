const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = 3001;
const OLLAMA_URL = 'http://127.0.0.1:11434';

const SYSTEM_PROMPT = `You are an expert SDET. Convert the following Selenium Java code to Idiomatic Playwright TypeScript.
Rules:
- Return ONLY the TypeScript code.
- No markdown formatting (like \`\`\`).
- Use 'await page.locator(...)' instead of driver.findElement.
- Wrap in 'test' blocks.
- Add necessary imports for @playwright/test.`;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'ui/dist')));

// Health check with Ollama status
app.get('/health', async (req, res) => {
    try {
        const response = await axios.get(OLLAMA_URL, { timeout: 2000 });
        res.json({ status: 'ok', ollama: 'connected', data: response.data });
    } catch (error) {
        res.status(503).json({ status: 'error', ollama: 'unreachable', message: error.message });
    }
});

// Fetch available models from local Ollama
app.get('/api/models', async (req, res) => {
    try {
        const response = await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 3000 });
        res.json(response.data.models || []);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch models", details: error.message });
    }
});

// Conversion endpoint with optimized streaming
app.post('/api/convert', async (req, res) => {
    const { inputCode, model, stream = true } = req.body;

    if (!inputCode) {
        return res.status(400).json({ error: "inputCode is required" });
    }

    const targetModel = model || 'llama3.2:latest';

    try {
        const requestConfig = {
            method: 'post',
            url: `${OLLAMA_URL}/api/generate`,
            data: {
                model: targetModel,
                prompt: inputCode,
                system: SYSTEM_PROMPT,
                stream: stream
            }
        };

        if (stream) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            const response = await axios({ ...requestConfig, responseType: 'stream' });

            response.data.on('data', chunk => {
                const lines = chunk.toString().split('\n');
                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const json = JSON.parse(line);
                        if (json.response) {
                            res.write(`data: ${JSON.stringify({ chunk: json.response })}\n\n`);
                        }
                        if (json.done) {
                            res.write(`data: ${JSON.stringify({ done: true, meta: json })}\n\n`);
                            res.end();
                        }
                    } catch (e) {
                        // Incomplete JSON chunk, skip and wait for more
                    }
                }
            });

            response.data.on('error', err => {
                console.error("Stream Error:", err);
                res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
                res.end();
            });
        } else {
            const response = await axios(requestConfig);
            res.json({
                result: response.data.response,
                meta: {
                    duration: response.data.total_duration,
                    model: targetModel
                }
            });
        }
    } catch (error) {
        console.error("Ollama Error:", error.message);
        const errorMsg = error.response?.status === 404 ? `Model '${targetModel}' not found.` : error.message;
        res.status(500).json({ error: "Conversion failed", details: errorMsg });
    }
});

app.get('/*all', (req, res) => {
    res.sendFile(path.join(__dirname, 'ui/dist', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Backend Proxy running on http://localhost:${PORT}`);
});
