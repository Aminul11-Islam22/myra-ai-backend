const Express = require('express');
const cors = require('cors');
const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');
const YouTube = require('youtube-sr').default; // প্রথম ভিডিও আইডি বের করার জন্য
require('dotenv').config();

const app = Express();

app.use(cors({ origin: '*' }));
app.use(Express.json({ limit: '50mb' }));
app.use(Express.urlencoded({ limit: '50mb', extended: true }));

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ইউটিউব ও সিস্টেম প্রম্পট নির্দেশিকা
const systemPrompt = `You are MYRA, a smart and friendly Bengali AI voice assistant.
CRITICAL INSTRUCTION: If the user asks to play a song, play music, or open YouTube (e.g., "ইউটিউব ওপেন করে একটা হিন্দি গান প্লে করো", "গান চালাও"), you MUST include a tag like [OPEN_YOUTUBE: song or query name] in your reply.

Example 1:
User: ইউটিউব ওপেন করে একটা হিন্দি গান প্লে করো
Assistant: [OPEN_YOUTUBE: hindi song] ঠিক আছে, আমি ইউটিউবে হিন্দি গান চালু করে দিচ্ছি।

Example 2:
User: অরিজিৎ সিং এর গান প্লে করো
Assistant: [OPEN_YOUTUBE: Arijit Singh songs] অবশ্যই, অরিজিৎ সিং এর গান প্লে করছি।`;

// ইউটিউবে গান সার্চ করে প্রথম ভিডিওর আইডি বের করার ফাংশন
async function processYoutubeTag(aiText) {
  if (!aiText || !aiText.includes('[OPEN_YOUTUBE:')) return aiText;

  const match = aiText.match(/\[OPEN_YOUTUBE:\s*(.*?)\]/);
  if (match && match[1]) {
    const songName = match[1].trim();
    try {
      // ইউটিউবে সার্চ করে সরাসরি প্রথম ভিডিও নিয়ে আসা
      const video = await YouTube.searchOne(songName);
      if (video && video.id) {
        // [OPEN_YOUTUBE: ...] ট্যাগ সরিয়ে [PLAY_VIDEO: videoId] দিয়ে রিপ্লেস করা
        return aiText.replace(/\[OPEN_YOUTUBE:.*?\]/g, `[PLAY_VIDEO: ${video.id}]`);
      }
    } catch (err) {
      console.error('YouTube Search Error:', err);
    }
  }
  return aiText;
}

app.get('/', (req, res) => {
  res.send('MYRA AI Backend is Live and Running!');
});

// টেক্সট চ্যাট রাউট
app.post('/chat', async (req, res) => {
  try {
    const userMessage = req.body.message || req.body.prompt;
    
    if (!userMessage) {
      return res.status(400).json({ error: 'Message input is required' });
    }

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      model: 'openai/gpt-oss-20b'
    });

    let aiReply = chatCompletion.choices[0]?.message?.content || 'কোনো উত্তর পাওয়া যায়নি।';
    
    // ভিডিও আইডি চেক ও রিপ্লেস লজিক
    aiReply = await processYoutubeTag(aiReply);

    return res.json({ 
      response: aiReply,
      reply: aiReply 
    });

  } catch (error) {
    console.error('Groq Chat Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// ভয়েস প্রসেস রাউট
app.post('/voice', async (req, res) => {
  const tempAudioPath = path.join(__dirname, `audio_${Date.now()}.wav`);
  
  try {
    const { audio } = req.body;
    if (!audio) return res.status(400).json({ error: 'No audio data provided' });

    const base64Data = audio.replace(/^data:audio\/\w+;base64,/, '');
    fs.writeFileSync(tempAudioPath, Buffer.from(base64Data, 'base64'));

    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(tempAudioPath),
      model: 'whisper-large-v3',
      language: 'bn'
    });

    if (fs.existsSync(tempAudioPath)) fs.unlinkSync(tempAudioPath);

    const userSpeech = transcription.text;
    if (!userSpeech || !userSpeech.trim()) {
      return res.json({ response: 'কথা স্পষ্ট শোনা যায়নি।' });
    }

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userSpeech }
      ],
      model: 'openai/gpt-oss-20b'
    });

    let aiReply = chatCompletion.choices[0]?.message?.content || 'দুঃখিত, কোনো উত্তর দেওয়া সম্ভব হয়নি।';
    
    // ভিডিও আইডি চেক ও রিপ্লেস লজিক
    aiReply = await processYoutubeTag(aiReply);

    return res.json({ transcript: userSpeech, response: aiReply });

  } catch (err) {
    if (fs.existsSync(tempAudioPath)) fs.unlinkSync(tempAudioPath);
    console.error('Voice Error:', err);
    return res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
          });
