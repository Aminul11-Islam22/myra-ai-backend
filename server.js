const express = require('express');
const axios = require('axios');
const cors = require('cors'); // CORS প্যাকেজ ইমপোর্ট করা হলো
const { createClient } = require('@supabase/supabase-js');

const app = express();

// ১. CORS কনফিগারেশন (যাতে যেকোনো ব্রাউজার/ফাইল থেকে রিকোয়েস্ট একসেপ্ট করে)
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Supabase Connection
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// ২. টেস্ট রুট (সার্ভার চেক করার জন্য)
app.get('/', (req, res) => {
    res.send('MYRA AI Backend is Running Successfully!');
});

// ৩. চ্যাট রুট
app.post('/chat', async (req, res) => {
    try {
        // ফ্রন্টএন্ড থেকে message অথবা speech_text দুটোর যেকোনোটি গ্রহণ করবে
        const userText = req.body.message || req.body.speech_text;
        
        if (!userText) {
            return res.status(400).json({ error: "Message is required" });
        }
        
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

        // ফ্রন্টএন্ডের সুবিধার জন্য reply এবং ai_response দুটোতেই উত্তর পাঠানো হচ্ছে
        res.json({ 
            reply: aiMessage,
            ai_response: aiMessage 
        });

    } catch (error) {
        console.error("Backend Error:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
