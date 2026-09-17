const express = require('express');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());

// Supabase Connection
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

app.post('/chat', async (req, res) => {
    try {
        const userText = req.body.speech_text;
        
        // Groq API Call
        const groqResponse = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: "llama-3.3-70b-versatile",
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

        res.json({ ai_response: aiMessage });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
