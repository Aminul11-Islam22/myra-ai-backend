const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const Groq = require('groq-sdk');
const gTTS = require('gtts');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const expressWs = require('express-ws')(app);

app.use(cors({ origin: '*' }));
app.use(express.json());

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

app.get('/', (req, res) => {
  res.send('MYRA AI Backend is Running');
});

// --- WEBSOCKET VOICE ROUTE ---
app.ws('/ws-voice', (ws, req) => {
  console.log('WebSocket Connected');

  ws.on('message', async (msg) => {
    // ইউনিক ফাইল নেম তৈরি (যাতে একের অধিক রিকোয়েস্ট ওভারল্যাপ না করে)
    const timestamp = Date.now();
    const tempAudioPath = path.join(__dirname, `input_${timestamp}.webm`);
    const tempMp3Path = path.join(__dirname, `output_${timestamp}.mp3`);

    try {
      // বাইনারি অডিও ফাইল সেভ করা
      fs.writeFileSync(tempAudioPath, msg);

      // ১. Groq Whisper API দিয়ে অডিও থেকে বাংলা টেক্সট করা
      const transcription = await groq.audio.transcriptions.create({
        file: fs.createReadStream(tempAudioPath),
        model: 'whisper-large-v3',
        language: 'bn',
      });

      const userText = transcription.text;

      // ইনপুট ফাইল মুছে ফেলা
      if (fs.existsSync(tempAudioPath)) {
        fs.unlinkSync(tempAudioPath);
      }

      if (!userText || !userText.trim()) return;

      // ২. Groq-এর সক্রিয় মডেল ব্যবহার করে উত্তর নেওয়া (স্ক্রিনশটের সঠিক মডেল)
      const chatCompletion = await groq.chat.completions.create({
        messages: [
          { role: 'system', content: 'You are MYRA, a helpful, natural Bengali AI assistant. Answer concisely.' },
          { role: 'user', content: userText }
        ],
        model: 'openai/gpt-oss-20b', // আপনার টার্মিনাল টেস্ট অনুযায়ী ওয়ার্কিং মডেল
      });

      const aiReply = chatCompletion.choices[0]?.message?.content || 'আমি দুঃখিত, বুঝতে পারিনি।';

      // ৩. gTTS দিয়ে উত্তরকে ভয়েসে রূপান্তর করা
      const gtts = new gTTS(aiReply, 'bn');

      gtts.save(tempMp3Path, (err) => {
        if (err) {
          console.error('TTS Error:', err);
          return;
        }

        if (fs.existsSync(tempMp3Path)) {
          const audioBuffer = fs.readFileSync(tempMp3Path);
          const audioBase64 = audioBuffer.toString('base64');
          
          // আউটপুট ফাইল মুছে ফেলা
          fs.unlinkSync(tempMp3Path);

          // ৪. ফ্রন্টএন্ডে ফলাফল পাঠানো
          if (ws.readyState === 1) { // 1 = OPEN
            ws.send(JSON.stringify({
              user_text: userText,
              ai_reply: aiReply,
              audio_base64: audioBase64
            }));
          }
        }
      });

    } catch (err) {
      console.error('Voice Processing Error:', err);
      
      // ফাইল ক্যাচ ব্লকেও নিরাপদভাবে ক্লিনআপ করা
      if (fs.existsSync(tempAudioPath)) fs.unlinkSync(tempAudioPath);
      if (fs.existsSync(tempMp3Path)) fs.unlinkSync(tempMp3Path);
    }
  });

  ws.on('close', () => {
    console.log('WebSocket Connection Closed');
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
