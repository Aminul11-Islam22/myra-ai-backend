const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

app.get('/', (req, res) => {
    res.send('MYRA AI Backend is Running Successfully!');
});

app.post('/chat', async (req, res) => {
    try {
        const userText = req.body.message || req.body.speech_text;
        
        if (!userText) {
            return res.status(400).json({ error: "Message is required" });
        }
        
        // Groq API Call (স্ক্রিনশটে কাজ করা সফল মডেলটি বসানো হয়েছে)
        const groqResponse = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: "openai/gpt-oss-20b",
            messages: [{ role: "user", content: userText }]
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const aiMessage = groqResponse.data.choices[0].message.content;

        // Save History to Supabase
        await supabase.from('chat_history').insert([
            { user_input: userText, ai_response: aiMessage }
        ]);

        res.json({ 
            reply: aiMessage,
            ai_response: aiMessage 
        });

    } catch (error) {
        console.error("Backend Error:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: error.response ? error.response.data : error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
